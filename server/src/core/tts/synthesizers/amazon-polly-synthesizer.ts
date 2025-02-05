import type { Stream } from 'node:stream'
import path from 'node:path'
import fs from 'node:fs'

import { Polly, SynthesizeSpeechCommand } from '@aws-sdk/client-polly'

import type { LongLanguageCode } from '@/types'
import type { SynthesizeResult } from '@/core/tts/types'
import type { AmazonVoiceConfigurationSchema } from '@/schemas/voice-config-schemas'
import { LANG, VOICE_CONFIG_PATH, TMP_PATH } from '@/constants'
import TextToSpeech from '@/core/tts/tts'
import { TTSSynthesizerBase } from '@/core/tts/tts-synthesizer-base'
import { LogHelper } from '@/helpers/log-helper'
import { StringHelper } from '@/helpers/string-helper'

const VOICES = {
  'en-US': {
    VoiceId: 'Matthew'
  },
  'fr-FR': {
    VoiceId: 'Mathieu'
  }
}

export default class AmazonPollySynthesizer extends TTSSynthesizerBase {
  protected readonly name = 'Amazon Polly TTS Synthesizer'
  protected readonly lang = LANG as LongLanguageCode
  private readonly client: Polly | undefined = undefined

  private _tts: TextToSpeech
  public get tts(): TextToSpeech {
    return this._tts
  }
  constructor(tts: TextToSpeech, lang: LongLanguageCode) {
    super()

    LogHelper.title(this.name)
    LogHelper.success('New instance')

    const config: AmazonVoiceConfigurationSchema = JSON.parse(
      fs.readFileSync(path.join(VOICE_CONFIG_PATH, 'amazon.json'), 'utf8')
    )

    this._tts = tts

    try {
      this.lang = lang
      this.client = new Polly(config)

      LogHelper.success('Synthesizer initialized')
    } catch (e) {
      LogHelper.error(`${this.name} - Failed to initialize: ${e}`)
    }
  }

  public async synthesize(speech: string): Promise<SynthesizeResult | null> {
    const audioFilePath = path.join(
      TMP_PATH,
      `${Date.now()}-${StringHelper.random(4)}.mp3`
    )

    try {
      if (this.client) {
        const result = await this.client.send(
          new SynthesizeSpeechCommand({
            OutputFormat: 'mp3',
            VoiceId: VOICES[this.lang].VoiceId,
            Text: speech
          })
        )
        // Cast to Node.js stream as the SDK returns a custom type that does not have a pipe method
        const AudioStream = result.AudioStream as Stream

        if (!AudioStream) {
          LogHelper.error(`${this.name} - AudioStream is undefined`)

          return null
        }

        const wStream = fs.createWriteStream(audioFilePath)
        AudioStream.pipe(wStream)

        await new Promise((resolve, reject) => {
          wStream.on('finish', resolve)
          wStream.on('error', reject)
        })

        const duration = await this.getAudioDuration(audioFilePath)

        this.tts.em.emit('saved', duration)

        return {
          audioFilePath,
          duration
        }
      }

      LogHelper.error(`${this.name} - Client is not defined yet`)
    } catch (e) {
      LogHelper.error(`${this.name} - Failed to synthesize speech: ${e} `)
    }

    return null
  }
}
