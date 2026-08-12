/**
 * Unit tests for recipe link pipeline + source URL normalization.
 * Run: npx vitest run src/lib/recipeLinkPipeline.test.ts
 *
 * Manual smoke checklist (after redeploying scrape-recipe-url):
 * - Instagram Reel: author credited, real thumbnail (not AI) when oEmbed has one, steps present
 * - YouTube Short: stageLog shows video_media method youtube_fileUri; ingredients + method filled
 * - TikTok: does not bail after oEmbed alone; caption/video/thumbnail attempted from HTML
 * - Generic blog with JSON-LD: early exit via json_ld; author + hero from schema/og
 * - Re-import same link (with/without utm_*): updates existing row instead of duplicate error
 * - Method ingredient chips render unbolded; caption is dish-specific (not "A delicious… featuring")
 */
import { describe, it, expect } from 'vitest'
import { mapScrapedRecipeToDraft } from './recipeLinkPipeline'
import { normalizeSourceUrl } from './recipes'
import {
  draftNeedsTranslation,
  isPlatformLogoUrl,
  recipeDraftIsComplete,
  type RecipeDraft,
} from './gemini'
import { makeIngredientToken, tokenizeStepText, rewriteIngredientTokensInSteps } from './stepFormatting'
import { clearScrapeJob, createScrapeJobId, readScrapeJob, writeScrapeJob } from './scrapeJobStorage'

function bareDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Test',
    description: null,
    author_name: null,
    author_handle: null,
    author_image_url: null,
    source_url: null,
    source_image_url: null,
    ingredients: [],
    recommended_tools: [],
    steps: [],
    tags: [],
    is_component: false,
    total_cook_minutes: null,
    prep_time_mins: 5,
    cook_time_mins: 10,
    inactive_time_mins: 0,
    servings: null,
    ...overrides,
  }
}

describe('mapScrapedRecipeToDraft', () => {
  it('maps multimodal payload with author, nutrition, and image', () => {
    const draft = mapScrapedRecipeToDraft(
      {
        title: 'Garlic Noodles',
        blurb: 'Savory garlic noodles tossed in soy butter.',
        author_name: 'Chef Mei',
        author_handle: '@chefmei',
        source_image_url: 'https://cdn.example.com/dish.jpg',
        ingredients: [{ name: 'spaghetti', amount: '8', unit: 'oz', canonical_key: 'pasta' }],
        instructions: ['Boil pasta.', 'Toss with garlic sauce.'],
        estimated_servings: 2,
        total_minutes: 20,
        cooking_level: 'easy',
        nutrition: { calories: 480, protein_g: 12, carbs_g: 62, fat_g: 18, fiber_g: 3, sodium_mg: 800, sugar_g: 4 },
      },
      'https://www.instagram.com/reel/abc123/?utm_source=ig_web',
      { authorName: 'Fallback', imageUrl: 'https://cdn.example.com/fallback.jpg' },
    )

    expect(draft).not.toBeNull()
    expect(draft!.name).toBe('Garlic Noodles')
    expect(draft!.author_name).toBe('Chef Mei')
    expect(draft!.description).toContain('garlic')
    expect(draft!.nutrition?.calories).toBe(480)
    expect(draft!.cooking_level).toBe('easy')
    expect(draft!.ingredients.length).toBe(1)
    expect(draft!.steps.length).toBe(2)
    // Tracking params stripped for reliable replace-by-link
    expect(draft!.source_url).not.toContain('utm_source')
  })

  it('drops social-junk lines (bare platform names, hashtags, likes/comments) from ingredients and steps', () => {
    const draft = mapScrapedRecipeToDraft(
      {
        title: 'Garlic Noodles',
        ingredients: [
          { name: 'spaghetti', amount: '8', unit: 'oz' },
          { name: 'Instagram' },
          { name: '#foodie #recipe' },
          { name: '159K likes, 524 comments' },
        ],
        instructions: ['Boil pasta.', 'TikTok', 'Toss with garlic sauce.'],
      },
      'https://www.instagram.com/reel/abc123/',
    )
    expect(draft).not.toBeNull()
    expect(draft!.ingredients.map((i) => i.name)).toEqual(['spaghetti'])
    expect(draft!.steps).toEqual(['Boil pasta.', 'Toss with garlic sauce.'])
  })

  it('falls back to meta author/image when recipe omits them', () => {
    const draft = mapScrapedRecipeToDraft(
      {
        title: 'Soup',
        ingredients: [{ name: 'broth', amount: '2', unit: 'cup' }],
        instructions: ['Simmer.'],
      },
      'https://example.com/recipe',
      { authorName: 'Meta Author', imageUrl: 'https://cdn.example.com/cover.jpg' },
    )
    expect(draft!.author_name).toBe('Meta Author')
    expect(draft!.source_image_url).toBe('https://cdn.example.com/cover.jpg')
  })
})

describe('normalizeSourceUrl', () => {
  it('lowercases, strips trailing slash, and drops tracking params', () => {
    expect(normalizeSourceUrl('https://WWW.Example.com/Recipe/?utm_source=ig&igshid=xyz&si=1')).toBe(
      'https://www.example.com/recipe',
    )
  })

  it('keeps meaningful query params', () => {
    expect(normalizeSourceUrl('https://example.com/watch?v=abc123&utm_medium=share')).toBe(
      'https://example.com/watch?v=abc123',
    )
  })

  it('returns null for empty', () => {
    expect(normalizeSourceUrl('')).toBeNull()
    expect(normalizeSourceUrl(null)).toBeNull()
  })
})

describe('isPlatformLogoUrl', () => {
  it('rejects obvious logos but keeps Instagram CDN thumbnails', () => {
    expect(isPlatformLogoUrl('https://cdn.example.com/app_icon.png')).toBe(true)
    expect(isPlatformLogoUrl('https://cdn.example.com/logo.svg')).toBe(true)
    expect(isPlatformLogoUrl('https://scontent.cdninstagram.com/v/t51.2885-15/123_n.jpg')).toBe(false)
    expect(isPlatformLogoUrl('https://i.ytimg.com/vi/abc/hqdefault.jpg')).toBe(false)
  })
})

describe('recipeDraftIsComplete', () => {
  it('requires both ingredients and steps', () => {
    expect(recipeDraftIsComplete(bareDraft({ ingredients: [{ name: 'flour', amount: '1', unit: 'cup', canonical_key: 'flour', notes: null }], steps: [] }))).toBe(false)
    expect(recipeDraftIsComplete(bareDraft({ ingredients: [], steps: ['Mix.'] }))).toBe(false)
    expect(
      recipeDraftIsComplete(
        bareDraft({
          ingredients: [{ name: 'flour', amount: '1', unit: 'cup', canonical_key: 'flour', notes: null }],
          steps: ['Mix and bake.'],
        }),
      ),
    ).toBe(true)
  })
})

describe('draftNeedsTranslation', () => {
  it('flags Chinese title/ingredients/steps', () => {
    expect(draftNeedsTranslation(bareDraft({ name: '蒜香面条' }))).toBe(true)
    expect(
      draftNeedsTranslation(
        bareDraft({
          name: 'Noodles',
          ingredients: [{ name: '大蒜', amount: '2', unit: '瓣', canonical_key: 'garlic', notes: null }],
          steps: ['Mix.'],
        }),
      ),
    ).toBe(true)
    expect(
      draftNeedsTranslation(
        bareDraft({
          name: 'Garlic Noodles',
          ingredients: [{ name: 'garlic', amount: '2', unit: 'clove', canonical_key: 'garlic', notes: null }],
          steps: ['Sauté garlic.'],
        }),
      ),
    ).toBe(false)
  })
})

describe('ingredient index tokens', () => {
  it('parses {{@i:Name}} and rewrites on swap', () => {
    expect(makeIngredientToken('Garlic', undefined, 2)).toBe('{{@2:Garlic}}')
    const tokens = tokenizeStepText('Add {{@0:Garlic}} and {{Butter}}')
    expect(tokens).toEqual([
      { kind: 'text', text: 'Add ' },
      { kind: 'ingredient', name: 'Garlic', notes: undefined, index: 0 },
      { kind: 'text', text: ' and ' },
      { kind: 'ingredient', name: 'Butter', notes: undefined, index: undefined },
    ])
    const rewritten = rewriteIngredientTokensInSteps(['Add {{@0:Garlic}} then {{Garlic}}'], {
      index: 0,
      oldName: 'Garlic',
      newName: 'Shallots',
    })
    expect(rewritten[0]).toContain('{{@0:Shallots}}')
    expect(rewritten[0]).not.toContain('Garlic')
  })
})

describe('scrapeJobStorage', () => {
  it('round-trips a job', () => {
    clearScrapeJob()
    const id = createScrapeJobId()
    writeScrapeJob({
      id,
      kind: 'link',
      url: 'https://example.com/r',
      status: 'Reading…',
      startedAt: Date.now(),
      inFlight: true,
    })
    const read = readScrapeJob()
    expect(read?.id).toBe(id)
    expect(read?.kind).toBe('link')
    clearScrapeJob()
    expect(readScrapeJob()).toBeNull()
  })
})
