import { useEffect, useRef, useState } from 'react'
import { BookPlus, Camera, ListPlus, PenLine, UploadCloud } from 'lucide-react'
import FigsTabBar, { type FigsTabId } from './components/FigsTabBar'
import {
  getIsRowInteractionActive,
  isRowSwipeSurface,
  wasRowInteractionRecent,
} from './context/RowInteractionContext'
import type { CreateMenuActionDef } from './components/CreateMenu'
import StashQuickAddSheet from './components/stash/StashQuickAddSheet'
import ScanCaptureSheet from './components/stash/ScanCaptureSheet'
import UploadRecipeModal from './components/UploadRecipeModal'
import CenteredPopup from './components/CenteredPopup'
import GroceryListEditSheet from './components/GroceryListEditSheet'
import type { GroceryList } from './lib/groceryLists'
import { useAuth } from './hooks/useAuth'
import { useUserAvatar } from './hooks/useUserAvatar'
import { useMeNavCompact } from './hooks/useMeNavCompact'
import { useStash } from './lib/stash'
import { useGroceryLists } from './lib/groceryLists'
import { isCanonicalEditable, removeFailedImportRecipe, useMyRecipes, type RecipeRow } from './lib/recipes'
import { pollRecipeReady } from './lib/recipeIntake'
import { autoGenerateMissingSubrecipes } from './lib/subrecipeAutogen'
import { useMyCookbooks, type CookbookRow } from './lib/cookbooks'
import { supabase } from './services/supabase'
import Auth from './pages/Auth'
import HomePage from './pages/Home'
import MePage from './pages/Me'
import StashPage from './pages/Stash'
import RecipeDetailPage from './pages/RecipeDetail'
import RecipeEditor, { type RecipeEditorInitialDraft } from './pages/RecipeEditor'
import GroceryListsPage from './pages/GroceryLists'
import CookbookDetailPage from './pages/CookbookDetail'
import CookbookCreatePage from './pages/CookbookCreatePage'

const VALID_TABS: FigsTabId[] = ['home', 'me']

function editorDraftFromRecipe(row: RecipeRow, userId: string): RecipeEditorInitialDraft {
  const ownsRecipe = row.user_id === userId
  const canonical = ownsRecipe && isCanonicalEditable(row)
  const cj = row.cleaned_json
  return {
    existingId: row.id,
    recipeId: row.id,
    title: row.title ?? '',
    description: cj?.description ?? null,
    author_name: row.author_name ?? null,
    source_image_url: row.source_image_url ?? null,
    source_url: row.source_url ?? null,
    ingredients: cj?.ingredients?.map((i) => ({
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      notes: i.notes,
    })),
    steps: cj?.steps ?? [],
    ingredient_blocks: cj?.ingredient_blocks,
    step_blocks: cj?.step_blocks,
    servings: cj?.servings ?? null,
    total_cook_minutes: cj?.total_cook_minutes ?? null,
    prep_time_mins: cj?.prep_time_mins ?? null,
    cook_time_mins: cj?.cook_time_mins ?? null,
    inactive_time_mins: cj?.inactive_time_mins ?? null,
    is_ai_generated_hero: cj?.is_ai_generated_hero,
    shelf_origin: row.shelf_origin,
    editTarget: canonical ? 'canonical' : 'override',
  }
}

async function loadRecipeRowForEdit(recipeId: string, shelf: RecipeRow[]): Promise<RecipeRow | null> {
  const fromShelf = shelf.find((r) => r.id === recipeId)
  if (fromShelf) return fromShelf
  if (!supabase) return null
  const { data } = await supabase
    .from('recipes')
    .select(
      'id, user_id, title, author_name, source_image_url, source_url, cleaned_json, created_at, shelf_origin, processing_status, processing_error, is_placeholder',
    )
    .eq('id', recipeId)
    .maybeSingle()
  if (!data) return null
  return data as RecipeRow
}

type OverlayView =
  | { type: 'stash' }
  | { type: 'recipe'; id: string; returnTo?: OverlayView }
  | { type: 'grocery-lists' }
  | { type: 'cookbook'; cookbook: CookbookRow }
  | { type: 'cookbook-create'; existing?: CookbookRow }
  | null

const HOME_ACTIONS: CreateMenuActionDef[] = [
  { id: 'quick-add', label: 'Quick Add', icon: PenLine },
  { id: 'scan', label: 'Scan / Capture', icon: Camera },
  { id: 'quick-list', label: 'Quick List', icon: ListPlus },
]

const ME_ACTIONS: CreateMenuActionDef[] = [
  { id: 'create-recipe', label: 'Create Recipe', icon: PenLine },
  { id: 'upload-recipe', label: 'Upload Recipe', icon: UploadCloud },
  { id: 'create-cookbook', label: 'Create Book', icon: BookPlus },
]

function AppShell({
  user,
  profile,
  signOut,
}: {
  user: NonNullable<ReturnType<typeof useAuth>['user']>
  profile: ReturnType<typeof useAuth>['profile']
  signOut: ReturnType<typeof useAuth>['signOut']
}) {
  const [tab, setTab] = useState<FigsTabId>(() => {
    try {
      const saved = sessionStorage.getItem('figs-rv0-active-tab')
      if (VALID_TABS.includes(saved as FigsTabId)) return saved as FigsTabId
    } catch {
      /* ignore */
    }
    return 'home'
  })
  const [overlay, setOverlay] = useState<OverlayView>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [recipeEditorDraft, setRecipeEditorDraft] = useState<RecipeEditorInitialDraft | null>(null)
  const [nestedRecipeEditorDraft, setNestedRecipeEditorDraft] = useState<RecipeEditorInitialDraft | null>(null)
  const [preferSelectRecipeId, setPreferSelectRecipeId] = useState<string | null>(null)
  const [nestedChildRefreshKey, setNestedChildRefreshKey] = useState(0)
  const [uploadRecipeOpen, setUploadRecipeOpen] = useState(false)
  const [quickListOpen, setQuickListOpen] = useState(false)
  const [focusListId, setFocusListId] = useState<string | null>(null)
  const [recipesRefreshKey, setRecipesRefreshKey] = useState(0)
  const [cookbooksRefreshKey, setCookbooksRefreshKey] = useState(0)
  const [groceryEditOpen, setGroceryEditOpen] = useState(false)
  const [meSearchOpen, setMeSearchOpen] = useState(false)
  const [meSearchQuery, setMeSearchQuery] = useState('')
  const [forceExpandKey, setForceExpandKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [importNoticeOpen, setImportNoticeOpen] = useState(false)
  const [customizationRefreshKey, setCustomizationRefreshKey] = useState(0)
  const meScrollRef = useRef<HTMLDivElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 3200)
  }

  const watchImport = (recipeId: string) => {
    setUploadRecipeOpen(false)
    setRecipesRefreshKey((n) => n + 1)
    setTab('me')
    setImportNoticeOpen(true)
    void pollRecipeReady(recipeId).then(async (result) => {
      if (result.status === 'ready') {
        setRecipesRefreshKey((n) => n + 1)
        setCookbooksRefreshKey((n) => n + 1)
        showToast(result.title ? `Ready: ${result.title}` : 'Recipe ready')
        setOverlay({ type: 'recipe', id: recipeId })
        void autoGenerateMissingSubrecipes(user.id, recipeId).then(() => {
          setRecipesRefreshKey((n) => n + 1)
          setCustomizationRefreshKey((n) => n + 1)
        })
        return
      }
      const reason = result.error?.trim() || 'Import failed'
      showToast(`Recipe failed to upload — ${reason}`)
      try {
        await removeFailedImportRecipe(recipeId, user.id)
      } catch (err) {
        console.warn('[watchImport] failed to remove errored recipe', err)
      }
      setRecipesRefreshKey((n) => n + 1)
    })
  }

  const stash = useStash(user.id)
  const groceries = useGroceryLists(user.id)
  const myRecipes = useMyRecipes(user.id, recipesRefreshKey)
  const myCookbooks = useMyCookbooks(user.id, cookbooksRefreshKey)
  const avatarUrl = useUserAvatar(user.id)
  const meNav = useMeNavCompact(meScrollRef, tab === 'me', forceExpandKey, false)
  const compactMode = tab === 'me' && meNav.compact && !meSearchOpen ? 'me' : null

  // Scrolling while search is open returns to the compressed nav.
  useEffect(() => {
    if (!meSearchOpen || tab !== 'me') return
    const el = meScrollRef.current
    if (!el) return
    const startY = el.scrollTop
    const onScroll = () => {
      if (Math.abs(el.scrollTop - startY) < 6) return
      setMeSearchOpen(false)
      setMeSearchQuery('')
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [meSearchOpen, tab])

  useEffect(() => {
    try {
      sessionStorage.setItem('figs-rv0-active-tab', tab)
    } catch {
      /* ignore */
    }
  }, [tab])

  const plusActions = tab === 'home' ? HOME_ACTIONS : ME_ACTIONS

  const handlePlusAction = (action: string) => {
    if (action === 'quick-list') {
      setQuickListOpen(true)
    } else if (action === 'quick-add') {
      setQuickAddOpen(true)
    } else if (action === 'scan') {
      setScanOpen(true)
    } else if (action === 'create-recipe') {
      setRecipeEditorDraft({ shelf_origin: 'created', editTarget: 'canonical' })
    } else if (action === 'upload-recipe') {
      setUploadRecipeOpen(true)
    } else if (action === 'create-cookbook') {
      setOverlay({ type: 'cookbook-create' })
    }
  }

  const anySheetOpen =
    quickAddOpen ||
    scanOpen ||
    recipeEditorDraft != null ||
    nestedRecipeEditorDraft != null ||
    uploadRecipeOpen ||
    groceryEditOpen ||
    quickListOpen

  const quickListDraft: GroceryList = {
    id: 'draft',
    user_id: '',
    name: '',
    created_at: '',
    archived_at: null,
    icon_key: null,
    icon_color: null,
    image_url: null,
    is_recurring: false,
    linked_recipe_id: null,
    position: null,
  }

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchBlocked = useRef(false)
  const tabIndex = tab === 'me' ? 1 : 0

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target
    if (isRowSwipeSurface(target) || getIsRowInteractionActive() || wasRowInteractionRecent()) {
      touchBlocked.current = true
      touchStartX.current = null
      touchStartY.current = null
      return
    }
    if (target instanceof Element && target.closest('.figs-tab-bar')) {
      touchBlocked.current = true
      touchStartX.current = null
      touchStartY.current = null
      return
    }
    const t = e.touches[0]
    if (!t) return
    touchBlocked.current = false
    touchStartX.current = t.clientX
    touchStartY.current = t.clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchBlocked.current || getIsRowInteractionActive() || wasRowInteractionRecent()) {
      touchBlocked.current = false
      touchStartX.current = null
      touchStartY.current = null
      return
    }
    if (touchStartX.current === null || touchStartY.current === null) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - touchStartX.current
    const dy = t.clientY - touchStartY.current

    touchStartX.current = null
    touchStartY.current = null

    // Threshold: swipe horizontal > 48px and dominant over vertical scroll (figs 1.0)
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      if (dx < 0 && tab === 'home') {
        setTab('me')
      } else if (dx > 0 && tab === 'me') {
        setTab('home')
      }
    }
  }

  return (
    <div className="figs-app-viewport">
      <div className="figs-phone-shell">
        <main
          className="figs-main-pane figs-main-pane--tabs figs-tab-carousel-viewport"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="figs-tab-carousel-track"
            style={{ transform: `translateX(-${tabIndex * 100}%)` }}
          >
            <div data-tab-panel="home" className="figs-tab-carousel-panel">
              <HomePage
                userId={user.id}
                username={profile?.username}
                stash={stash}
                groceries={groceries}
                recipes={myRecipes.recipes}
                focusListId={focusListId}
                onOpenStash={() => setOverlay({ type: 'stash' })}
                onOpenRecipe={(id) => setOverlay({ type: 'recipe', id })}
                onOpenGroceryLists={() => setOverlay({ type: 'grocery-lists' })}
                onEditSheetToggle={setGroceryEditOpen}
              />
            </div>
            <div data-tab-panel="me" className="figs-tab-carousel-panel">
              <MePage
                userId={user.id}
                username={profile?.username}
                recipes={myRecipes}
                cookbooks={myCookbooks}
                scrollRef={meScrollRef}
                searchQuery={meSearchQuery}
                headerProgress={meNav.progress}
                onOpenRecipe={(id) => setOverlay({ type: 'recipe', id })}
                onOpenCookbook={(cookbook) => setOverlay({ type: 'cookbook', cookbook })}
                onSignOut={() => void signOut()}
              />
            </div>
          </div>
        </main>

        {!overlay && !anySheetOpen ? (
          <FigsTabBar
            tab={tab}
            onTab={(next) => {
              if (next === tab && tab === 'me') {
                meScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
              } else {
                setTab(next)
              }
            }}
            plusActions={plusActions}
            onPlusAction={handlePlusAction}
            compactMode={compactMode}
            scrollProgress={meNav.progress}
            profileAvatarUrl={avatarUrl}
            searchOpen={tab === 'me' && meSearchOpen}
            searchQuery={meSearchQuery}
            onSearchQueryChange={setMeSearchQuery}
            onSearchFocus={() => setMeSearchOpen(true)}
            onSearchClose={() => {
              setMeSearchOpen(false)
              setMeSearchQuery('')
            }}
            onExpandRequest={() => setForceExpandKey((n) => n + 1)}
          />
        ) : null}

        {overlay?.type === 'stash' ? (
          <StashPage
            stash={stash}
            onBack={() => setOverlay(null)}
            onQuickAdd={() => setQuickAddOpen(true)}
            onScan={() => setScanOpen(true)}
          />
        ) : null}

        {overlay?.type === 'recipe' ? (
          <RecipeDetailPage
            key={`${overlay.id}:${customizationRefreshKey}`}
            recipeId={overlay.id}
            userId={user.id}
            onBack={() => setOverlay(overlay.returnTo ?? null)}
            onOpenRecipe={(id) => setOverlay({ type: 'recipe', id })}
            onEdit={(row) => {
              setRecipeEditorDraft(editorDraftFromRecipe(row, user.id))
            }}
            onDeleted={() => {
              setRecipesRefreshKey((n) => n + 1)
              setOverlay(null)
            }}
            stash={stash}
            groceries={groceries}
          />
        ) : null}

        {overlay?.type === 'grocery-lists' ? (
          <GroceryListsPage
            userId={user.id}
            groceries={groceries}
            stash={stash}
            recipes={myRecipes.recipes}
            onBack={() => setOverlay(null)}
            onOpenRecipe={(id) => setOverlay({ type: 'recipe', id, returnTo: { type: 'grocery-lists' } })}
          />
        ) : null}

        {overlay?.type === 'cookbook' ? (
          <CookbookDetailPage
            cookbook={overlay.cookbook}
            onBack={() => setOverlay(null)}
            onOpenRecipe={(id) => setOverlay({ type: 'recipe', id })}
            onEdit={() => setOverlay({ type: 'cookbook-create', existing: overlay.cookbook })}
            onDeleted={() => {
              setCookbooksRefreshKey((n) => n + 1)
              setOverlay(null)
            }}
          />
        ) : null}

        {overlay?.type === 'cookbook-create' ? (
          <CookbookCreatePage
            userId={user.id}
            username={profile?.username}
            recipes={myRecipes.recipes}
            existing={overlay.existing}
            preferSelectRecipeId={preferSelectRecipeId}
            onCreateRecipeFromPicker={() => {
              setNestedRecipeEditorDraft({ shelf_origin: 'created', editTarget: 'canonical' })
            }}
            onClose={(result) => {
              setCookbooksRefreshKey((n) => n + 1)
              setPreferSelectRecipeId(null)
              if (result?.reopen) {
                setOverlay({ type: 'cookbook', cookbook: result.reopen })
              } else {
                setOverlay(null)
              }
            }}
          />
        ) : null}
      </div>

      {quickAddOpen ? (
        <StashQuickAddSheet onClose={() => setQuickAddOpen(false)} onAdd={stash.addItem} />
      ) : null}

      {quickListOpen ? (
        <GroceryListEditSheet
          list={quickListDraft}
          createMode
          onClose={() => setQuickListOpen(false)}
          onRename={() => {}}
          onChangeAppearance={() => {}}
          onCreate={async ({ name, iconKey, iconColor, recurring }) => {
            const id = await groceries.createList(name, { recurring })
            if (id) await groceries.updateListAppearance(id, { iconKey, iconColor })
            if (id) setFocusListId(id)
            setQuickListOpen(false)
          }}
        />
      ) : null}

      {scanOpen ? (
        <ScanCaptureSheet
          userId={user.id}
          onClose={() => setScanOpen(false)}
          onAddItems={stash.addItems}
          onAdded={() => setOverlay({ type: 'stash' })}
          createReceiptLog={stash.createReceiptLog}
        />
      ) : null}

      {recipeEditorDraft ? (
        <div className="relative z-[230]">
          <RecipeEditor
            key={recipeEditorDraft.recipeId ?? recipeEditorDraft.source_url ?? 'create'}
            userId={user.id}
            username={profile?.username}
            initialDraft={recipeEditorDraft}
            stashItems={stash.items}
            recipes={myRecipes.recipes}
            preferSelectRecipeId={preferSelectRecipeId}
            onConsumedPreferSelect={() => setPreferSelectRecipeId(null)}
            onRequestCreateFromPicker={() => {
              setNestedRecipeEditorDraft({ shelf_origin: 'created', editTarget: 'canonical' })
            }}
            onRequestEditSubrecipe={(childId) => {
              void loadRecipeRowForEdit(childId, myRecipes.recipes).then((row) => {
                if (row) setNestedRecipeEditorDraft(editorDraftFromRecipe(row, user.id))
              })
            }}
            nestedChildRefreshKey={nestedChildRefreshKey}
            onClose={(createdId) => {
              setRecipeEditorDraft(null)
              if (createdId) {
                setRecipesRefreshKey((n) => n + 1)
                setCustomizationRefreshKey((n) => n + 1)
                setOverlay({ type: 'recipe', id: createdId })
              }
            }}
          />
        </div>
      ) : null}

      {nestedRecipeEditorDraft ? (
        <div className="relative z-[250]">
          <RecipeEditor
            key={nestedRecipeEditorDraft.existingId ?? nestedRecipeEditorDraft.recipeId ?? 'nested-create'}
            userId={user.id}
            username={profile?.username}
            initialDraft={nestedRecipeEditorDraft}
            stashItems={stash.items}
            recipes={myRecipes.recipes}
            onClose={(createdId) => {
              const wasEdit = Boolean(nestedRecipeEditorDraft.existingId)
              setNestedRecipeEditorDraft(null)
              setRecipesRefreshKey((n) => n + 1)
              if (wasEdit) setNestedChildRefreshKey((n) => n + 1)
              // Brand-new embeds select into the parent picker; editing an existing child returns to parent.
              if (!wasEdit && createdId) setPreferSelectRecipeId(createdId)
            }}
          />
        </div>
      ) : null}

      {uploadRecipeOpen ? (
        <UploadRecipeModal
          userId={user.id}
          onClose={() => setUploadRecipeOpen(false)}
          onImportStarted={watchImport}
        />
      ) : null}

      {importNoticeOpen ? (
        <CenteredPopup title="Uploading your recipe" onClose={() => setImportNoticeOpen(false)}>
          <p className="font-ui text-[14px] leading-relaxed text-[#332e3d]">
            Feel free to wait or close the app. figs is uploading your recipe…
          </p>
          <button
            type="button"
            onClick={() => setImportNoticeOpen(false)}
            className="mt-4 h-11 w-full rounded-lg border-0 bg-[#1A0D40] font-ui text-[14px] font-semibold text-white"
          >
            Got it
          </button>
        </CenteredPopup>
      ) : null}

      {toast ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-[300] flex justify-center px-4"
          style={{ top: 'calc(0.65rem + env(safe-area-inset-top, 0px))' }}
        >
          <div className="max-w-[min(92vw,22rem)] rounded-2xl border border-[#ECE9E3] bg-white/95 px-4 py-2.5 font-ui text-[13px] font-semibold text-[#111] shadow-[0_10px_30px_-12px_rgba(20,10,40,0.28)] backdrop-blur-md">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function App() {
  const { user, profile, loading, signIn, signUp, signOut } = useAuth()

  if (loading) {
    return (
      <div className="figs-app-viewport px-4 pt-[env(safe-area-inset-top,0px)]">
        <div className="flex w-full max-w-lg flex-1 flex-col items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E8E8ED] border-t-[#1A0D40]" />
        </div>
      </div>
    )
  }

  if (!user) {
    return <Auth signIn={signIn} signUp={signUp} />
  }

  return <AppShell user={user} profile={profile} signOut={signOut} />
}
