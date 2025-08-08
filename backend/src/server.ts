import {app} from './app'; // Imports from app.ts

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach(signal => {
  process.on(signal, () => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    server.close(() => {
      console.log('Server closed.');
      // Gracefully close prisma client if needed, though it often manages its own connections
      // prisma.$disconnect().then(() => console.log('Prisma client disconnected.'));
      process.exit(0);
    });
  });
});