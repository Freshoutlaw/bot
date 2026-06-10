const Groq = require('groq-sdk');
const logger = require('./logger');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const SYSTEM_PROMPT = `You are a friendly and professional customer service assistant for a waitlist management system. 
Your role is to:
1. Help customers join the waitlist
2. Check their position in the queue
3. Answer questions about wait times
4. Handle cancellations politely
5. Provide helpful information about the service

Guidelines:
- Be warm, concise, and professional
- Keep responses under 3 sentences unless providing instructions
- Always be empathetic about wait times
- If unsure, guide users to the main menu
- Never share other customers' personal information
- Respond in the same language the customer uses

Available commands you should mention:
- JOIN - to join the waitlist
- STATUS - to check their position
- CANCEL - to leave the waitlist
- HELP - to see all options`;

/**
 * Get an AI-powered response for unstructured messages
 */
async function getAIResponse(userMessage, context = {}) {
  try {
    const contextStr = context.position
      ? `\nContext: Customer is at position ${context.position} in the waitlist with ~${context.estimatedWait} minutes estimated wait.`
      : '';

    const response = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT + contextStr,
        },
        {
          role: 'user',
          content: String(userMessage).slice(0, 500), // Limit input length
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || getDefaultResponse();
  } catch (err) {
    logger.error('Groq API error:', err.message);
    return getDefaultResponse();
  }
}

function getDefaultResponse() {
  return (
    "I'm here to help! Reply with:\n" +
    '• *JOIN* — Add yourself to the waitlist\n' +
    '• *STATUS* — Check your position\n' +
    '• *CANCEL* — Leave the waitlist\n' +
    '• *HELP* — See all options'
  );
}

module.exports = { getAIResponse, getDefaultResponse };