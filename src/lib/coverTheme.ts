/** Average a cover image down to a single hex for cookbook hero gradients. */

const DEFAULT_THEME = '#1a0d40'

export function cookbookHeroGradient(themeHex: string | null | undefined): string {
  const mid = themeHex?.trim() || DEFAULT_THEME
  return `linear-gradient(165deg, #2a1a5a 0%, ${mid} 45%, #35503f 100%)`
}

/** Sample a 32×32 canvas average of the image → `#rrggbb`. Returns null on CORS/load failure. */
export async function extractDominantColorFromImage(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const size = 32
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0, size, size)
        const data = ctx.getImageData(0, 0, size, size).data
        let r = 0
        let g = 0
        let b = 0
        let count = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! < 128) continue
          r += data[i]!
          g += data[i + 1]!
          b += data[i + 2]!
          count += 1
        }
        if (!count) {
          resolve(null)
          return
        }
        const toHex = (v: number) => Math.round(v / count).toString(16).padStart(2, '0')
        resolve(`#${toHex(r)}${toHex(g)}${toHex(b)}`)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export { DEFAULT_THEME as DEFAULT_COOKBOOK_THEME }
