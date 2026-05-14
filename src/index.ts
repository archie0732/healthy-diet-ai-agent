import 'dotenv/config';
import express from 'express';
import {
  AI_API_URL,
  approveHandler,
  chatHandler,
  corsMiddleware,
  errorHandler,
  generateTitleHandler,
  imagesStaticMiddleware,
  isSupabaseReady,
  jsonBodyParser,
  pingHandler,
  requestLoggerMiddleware,
  REQUEST_BODY_LIMIT,
  urlencodedBodyParser,
} from './serverHandlers';

const app = express();
const PORT = Number(process.env.PORT) || 8001;

app.use(corsMiddleware);
app.use(jsonBodyParser);
app.use(urlencodedBodyParser);
app.use(requestLoggerMiddleware);
app.use('/images', imagesStaticMiddleware);

app.post('/api/chat', chatHandler);
app.post('/api/approve', approveHandler);
app.post('/api/generate_title', generateTitleHandler);
app.get('/ping', pingHandler);

app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log('\nDiet Manager Agent Server started');
  console.log(`Thread-based memory ready (Supabase): ${isSupabaseReady}`);
  console.log(`API URL: http://localhost:${PORT}/api/chat`);
  console.log(`LLM base URL: ${AI_API_URL}`);
  console.log(`Request body limit: ${REQUEST_BODY_LIMIT}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[PROCESS] Uncaught Exception:', error);
});
