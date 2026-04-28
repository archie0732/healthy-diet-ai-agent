import 'dotenv/config'
import { ChatOpenAI } from '@langchain/openai'

const AI_API_URL = process.env['AI_API_URL']
const llm = new ChatOpenAI({
    model: AI_API_URL,
    temperature: 0.7,
    // other params...
})



const ai_agent_client = async () => {

}

