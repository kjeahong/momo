import { createApp } from './app.js';

const app = createApp();
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Momo 서버 실행 중: http://localhost:${PORT}`);
});
