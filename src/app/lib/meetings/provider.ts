// Media-provider adapter for virtual meetings.
//
// The rest of the app talks ONLY to this interface, never to a specific vendor —
// so we can start on managed LiveKit Cloud and later point the same code at a
// self-hosted LiveKit on our Hostinger VPS by changing env vars only (or add a
// Daily/Agora implementation) with zero changes above this layer.
//
// A LiveKit join token is a JWT (HS256, signed with the API secret) carrying a
// `video` grant. The format is identical for LiveKit Cloud and self-hosted, so
// we mint it with `jsonwebtoken`. Room lifecycle (end/kick/mute) and recording
// use the LiveKit server SDK (`RoomServiceClient` / `EgressClient`).
import jwt from 'jsonwebtoken'
import {
  RoomServiceClient,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  TrackType,
  WebhookReceiver,
  WebhookEvent,
} from 'livekit-server-sdk'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface JoinTokenOptions {
  roomName: string
  identity: string      // unique, stable participant id
  name: string          // display name shown in the call
  isHost: boolean
  ttlSeconds?: number    // default 1h
  /** Lobby: issue a restricted token (can't publish/subscribe) until a host admits. */
  waiting?: boolean
}

export interface ParticipantSummary {
  identity: string
  name: string
  audioTrackSid?: string
  micMuted: boolean
}

export interface RecordingHandle {
  egressId: string
  url: string | null
  /** S3 object key — source of truth for signed playback URLs (see getRecordingDownloadUrl). */
  filePath: string
}

export interface MeetingProvider {
  readonly kind: string
  /** WebSocket URL the browser connects to (safe to expose to the client). */
  readonly wsUrl: string
  /** True when the provider has the env it needs to mint tokens. */
  isConfigured(): boolean
  issueJoinToken(o: JoinTokenOptions): Promise<string>
  /** Force-close a room (host "End for all"). */
  endRoom(roomName: string): Promise<void>

  // ----- Moderation (host controls) -----
  listParticipants(roomName: string): Promise<ParticipantSummary[]>
  removeParticipant(roomName: string, identity: string): Promise<void>
  setParticipantMuted(roomName: string, identity: string, muted: boolean): Promise<void>
  /** Mute everyone except the given identities. Returns how many were muted. */
  muteAll(roomName: string, exceptIdentities?: string[]): Promise<number>
  /** Lobby: grant a waiting participant full publish/subscribe (host admit). */
  admitParticipant(roomName: string, identity: string): Promise<void>

  // ----- Recording (Egress → S3) -----
  /** True when both the provider AND recording storage are configured. */
  canRecord(): boolean
  startRecording(roomName: string, meetingId: string): Promise<RecordingHandle>
  stopRecording(egressId: string): Promise<void>
  /** Short-lived signed GET URL for a private-bucket recording, or null if not configured. */
  getRecordingDownloadUrl(key: string, ttlSeconds?: number): Promise<string | null>
}

class LiveKitProvider implements MeetingProvider {
  readonly kind = 'livekit'
  private apiKey = process.env.LIVEKIT_API_KEY || ''
  private apiSecret = process.env.LIVEKIT_API_SECRET || ''
  // Accept either LIVEKIT_URL or LIVEKIT_WS_URL; strip a trailing slash.
  readonly wsUrl = (process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL || '').replace(/\/$/, '')

  private _room: RoomServiceClient | null = null
  private _egress: EgressClient | null = null

  isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret && this.wsUrl)
  }

  // Server-side clients need the HTTPS host, not the wss:// URL.
  private httpUrl(): string {
    return this.wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')
  }
  private room(): RoomServiceClient {
    if (!this.isConfigured()) throw new Error('MEETING_PROVIDER_NOT_CONFIGURED')
    if (!this._room) this._room = new RoomServiceClient(this.httpUrl(), this.apiKey, this.apiSecret)
    return this._room
  }
  private egress(): EgressClient {
    if (!this.isConfigured()) throw new Error('MEETING_PROVIDER_NOT_CONFIGURED')
    if (!this._egress) this._egress = new EgressClient(this.httpUrl(), this.apiKey, this.apiSecret)
    return this._egress
  }

  async issueJoinToken(o: JoinTokenOptions): Promise<string> {
    if (!this.isConfigured()) throw new Error('MEETING_PROVIDER_NOT_CONFIGURED')
    // Waiting participants join the room (so the host can see them in the lobby)
    // but can neither publish nor subscribe until admitted.
    const grant: Record<string, any> = {
      room: o.roomName,
      roomJoin: true,
      canPublish: !o.waiting,
      canSubscribe: !o.waiting,
      canPublishData: !o.waiting,
    }
    if (o.isHost) grant.roomAdmin = true
    const claims: Record<string, any> = { video: grant, name: o.name }
    if (o.waiting) claims.metadata = JSON.stringify({ waiting: true })
    return (jwt as any).sign(
      claims,
      this.apiSecret,
      {
        issuer: this.apiKey,
        subject: o.identity,
        jwtid: o.identity,
        notBefore: 0,
        expiresIn: o.ttlSeconds && o.ttlSeconds > 0 ? o.ttlSeconds : 3600,
        algorithm: 'HS256',
      },
    ) as string
  }

  async admitParticipant(roomName: string, identity: string): Promise<void> {
    await this.room().updateParticipant(roomName, identity, {
      metadata: JSON.stringify({ waiting: false }),
      permission: { canPublish: true, canSubscribe: true, canPublishData: true },
    })
  }

  async endRoom(roomName: string): Promise<void> {
    try { await this.room().deleteRoom(roomName) }
    catch (e: any) {
      // A room that was never joined doesn't exist on the SFU — that's fine.
      if (!/does not exist|not found/i.test(e?.message || '')) throw e
    }
  }

  async listParticipants(roomName: string): Promise<ParticipantSummary[]> {
    let raw: any[]
    try { raw = await this.room().listParticipants(roomName) }
    catch (e: any) {
      if (/does not exist|not found/i.test(e?.message || '')) return []
      throw e
    }
    return (raw || []).map((p: any) => {
      const audio = (p.tracks || []).find((t: any) => t.type === TrackType.AUDIO)
      return {
        identity: p.identity,
        name: p.name || p.identity,
        audioTrackSid: audio?.sid,
        micMuted: audio ? !!audio.muted : true,
      }
    })
  }

  async removeParticipant(roomName: string, identity: string): Promise<void> {
    await this.room().removeParticipant(roomName, identity)
  }

  async setParticipantMuted(roomName: string, identity: string, muted: boolean): Promise<void> {
    const parts = await this.listParticipants(roomName)
    const target = parts.find((p) => p.identity === identity)
    if (!target?.audioTrackSid) return
    await this.room().mutePublishedTrack(roomName, identity, target.audioTrackSid, muted)
  }

  async muteAll(roomName: string, exceptIdentities: string[] = []): Promise<number> {
    const except = new Set(exceptIdentities)
    const parts = await this.listParticipants(roomName)
    let muted = 0
    for (const p of parts) {
      if (except.has(p.identity) || !p.audioTrackSid || p.micMuted) continue
      try {
        await this.room().mutePublishedTrack(roomName, p.identity, p.audioTrackSid, true)
        muted++
      } catch { /* skip individual failures */ }
    }
    return muted
  }

  canRecord(): boolean {
    return (
      this.isConfigured() &&
      !!(process.env.LIVEKIT_S3_ACCESS_KEY &&
        process.env.LIVEKIT_S3_SECRET &&
        process.env.LIVEKIT_S3_BUCKET &&
        process.env.LIVEKIT_S3_REGION)
    )
  }

  async startRecording(roomName: string, meetingId: string): Promise<RecordingHandle> {
    if (!this.canRecord()) throw new Error('RECORDING_NOT_CONFIGURED')
    const filepath = `recordings/${meetingId}/${Date.now()}.mp4`
    const endpoint = process.env.LIVEKIT_S3_ENDPOINT || undefined
    const s3 = new S3Upload({
      accessKey: process.env.LIVEKIT_S3_ACCESS_KEY!,
      secret: process.env.LIVEKIT_S3_SECRET!,
      region: process.env.LIVEKIT_S3_REGION!,
      bucket: process.env.LIVEKIT_S3_BUCKET!,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    })
    const fileOutput = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath,
      output: { case: 's3', value: s3 },
    })
    const info: any = await this.egress().startRoomCompositeEgress(
      roomName,
      { file: fileOutput },
      { layout: 'grid' },
    )
    const publicBase = (process.env.LIVEKIT_S3_PUBLIC_URL || '').replace(/\/$/, '')
    const url = publicBase ? `${publicBase}/${filepath}` : null
    return { egressId: info?.egressId || info?.egress_id || '', url, filePath: filepath }
  }

  async stopRecording(egressId: string): Promise<void> {
    if (!egressId) return
    try { await this.egress().stopEgress(egressId) }
    catch (e: any) {
      if (!/not found|already|complete/i.test(e?.message || '')) throw e
    }
  }

  private _s3: S3Client | null = null
  private s3(): S3Client {
    const endpoint = process.env.LIVEKIT_S3_ENDPOINT || undefined
    if (!this._s3) {
      this._s3 = new S3Client({
        region: process.env.LIVEKIT_S3_REGION!,
        credentials: {
          accessKeyId: process.env.LIVEKIT_S3_ACCESS_KEY!,
          secretAccessKey: process.env.LIVEKIT_S3_SECRET!,
        },
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      })
    }
    return this._s3
  }

  async getRecordingDownloadUrl(key: string, ttlSeconds = 300): Promise<string | null> {
    if (!this.canRecord() || !key) return null
    const cmd = new GetObjectCommand({ Bucket: process.env.LIVEKIT_S3_BUCKET!, Key: key })
    return getSignedUrl(this.s3(), cmd, { expiresIn: ttlSeconds })
  }
}

// Verifies a LiveKit webhook request (signed with our own API key/secret) and
// returns the parsed event, or null if the signature/body doesn't check out.
// `authHeader` is the request's raw `Authorization` header; `body` MUST be the
// unparsed raw request text (signature covers the exact bytes sent).
export async function verifyLiveKitWebhook(body: string, authHeader: string | null): Promise<WebhookEvent | null> {
  const apiKey = process.env.LIVEKIT_API_KEY || ''
  const apiSecret = process.env.LIVEKIT_API_SECRET || ''
  if (!apiKey || !apiSecret || !authHeader) return null
  try {
    const receiver = new WebhookReceiver(apiKey, apiSecret)
    return await receiver.receive(body, authHeader)
  } catch {
    return null
  }
}

let cached: MeetingProvider | null = null

// Returns the configured provider. Extend the switch to add Daily/Agora later.
export function getMeetingProvider(): MeetingProvider {
  if (cached) return cached
  const kind = (process.env.MEETING_PROVIDER || 'livekit').toLowerCase()
  switch (kind) {
    case 'livekit':
    default:
      cached = new LiveKitProvider()
      return cached
  }
}
