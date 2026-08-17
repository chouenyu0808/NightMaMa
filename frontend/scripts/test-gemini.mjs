import { GoogleGenAI } from '@google/genai'
import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
const key = env.match(/NEXT_PUBLIC_GEMINI_KEY=(.+)/)[1].trim()

const ai = new GoogleGenAI({ apiKey: key })
const interaction = await ai.interactions.create({
  model: 'gemini-3.7-flash',
  input: '你是夜間步行陪伴語音助理，簡短溫暖地回應（30字內、繁體中文）：我現在走在暗巷有點緊張',
})
console.log(interaction.output_text)
