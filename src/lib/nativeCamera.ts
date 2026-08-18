import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

type CameraPerm = 'camera' | 'photos'

function isGranted(state: string | undefined) {
  return state === 'granted' || state === 'limited'
}

export function isNativeCameraPlatform() {
  return Capacitor.isNativePlatform()
}

export function isCameraCanceled(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /cancel|dismiss|user canceled|user cancelled/i.test(message)
}

export async function ensureNativeCameraPermissions(
  permissions: CameraPerm[] = ['camera', 'photos'],
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true

  const checkStatus = await Camera.checkPermissions()
  const needsRequest = permissions.some((permission) => !isGranted(checkStatus[permission]))
  if (!needsRequest) return true

  const requestStatus = await Camera.requestPermissions({ permissions })
  return permissions.every((permission) => isGranted(requestStatus[permission]))
}

async function fileFromWebPath(webPath: string, name: string): Promise<File> {
  const response = await fetch(webPath)
  const blob = await response.blob()
  const type = blob.type || 'image/jpeg'
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
  const filename = name.includes('.') ? name : `${name}.${ext}`
  return new File([blob], filename, { type })
}

export async function captureNativePhoto(
  source: CameraSource = CameraSource.Prompt,
): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) return null

  const permissions: CameraPerm[] =
    source === CameraSource.Camera
      ? ['camera']
      : source === CameraSource.Photos
        ? ['photos']
        : ['camera', 'photos']

  const ok = await ensureNativeCameraPermissions(permissions)
  if (!ok) {
    throw new Error('Camera permission is required to take photos. Please enable it in Settings.')
  }

  const image = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source,
  })
  if (!image.webPath) return null
  return fileFromWebPath(image.webPath, `photo.${image.format || 'jpeg'}`)
}

export async function pickNativePhotos(limit = 8): Promise<File[] | null> {
  if (!Capacitor.isNativePlatform()) return null

  const ok = await ensureNativeCameraPermissions(['photos'])
  if (!ok) {
    throw new Error('Photo library permission is required. Please enable it in Settings.')
  }

  const result = await Camera.pickImages({ quality: 90, limit })
  const files: File[] = []
  for (const photo of result.photos) {
    if (!photo.webPath) continue
    files.push(await fileFromWebPath(photo.webPath, `photo.${photo.format || 'jpeg'}`))
  }
  return files
}

export async function pickPhotoNativeOrFallback(fallback: () => void): Promise<File | undefined> {
  try {
    const file = await captureNativePhoto(CameraSource.Prompt)
    if (file) return file
    fallback()
  } catch (error) {
    if (isCameraCanceled(error)) return
    window.alert(error instanceof Error ? error.message : 'Camera capture failed.')
  }
}
