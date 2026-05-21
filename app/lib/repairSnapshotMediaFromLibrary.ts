import type { AccountMediaKind } from '@/app/lib/accountMediaTypes'
import { accountMediaAssetPlaybackUrl } from '@/app/lib/timeline/mediaUploadUtils'
import { needsPersistedMediaUrlRepair } from '@/app/lib/persistedMediaRefs'
import {
  fetchAllAccountMediaAssets,
  findAccountAssetForTimelineItem,
} from '@/app/lib/accountMediaLibraryMatch'
import { useManifestStore } from '@/app/stores/manifestStore'

function repairUrl(
  url: string | undefined,
  label: string,
  kind: AccountMediaKind,
  assets: Awaited<ReturnType<typeof fetchAllAccountMediaAssets>>
): string | undefined {
  if (!needsPersistedMediaUrlRepair(url)) return url
  const asset = findAccountAssetForTimelineItem(assets, label, kind)
  if (!asset) return ''
  return accountMediaAssetPlaybackUrl(asset.id)
}

export async function repairSnapshotMediaFromAccountLibrary(): Promise<boolean> {
  const assets = await fetchAllAccountMediaAssets()
  if (assets.length === 0) return false

  const state = useManifestStore.getState()
  let imagesChanged = false
  let videosChanged = false
  let audiosChanged = false

  const images = state.images.map((image) => {
    const url = repairUrl(image.url, image.name, 'image', assets)
    if (url === image.url) return image
    imagesChanged = true
    return image.copy({ url: url ?? '' })
  })

  const videos = state.videos.map((video) => {
    const url = repairUrl(video.url, video.title, 'video', assets)
    const sourceUrl = repairUrl(video.sourceUrl, video.title, 'video', assets)
    if (url === video.url && sourceUrl === video.sourceUrl) return video
    videosChanged = true
    return video.copy({
      url: url === undefined ? video.url : url,
      sourceUrl: sourceUrl === undefined ? video.sourceUrl : sourceUrl,
    })
  })

  const audios = state.audios.map((audio) => {
    const url = repairUrl(audio.url, audio.name, 'audio', assets)
    if (url === audio.url) return audio
    audiosChanged = true
    return audio.copy({ url: url ?? '' })
  })

  if (!imagesChanged && !videosChanged && !audiosChanged) return false

  useManifestStore.setState({ images, videos, audios })
  return true
}
