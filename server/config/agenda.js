const { Agenda } = require('agenda');
const Story = require('../models/Story');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('CRITICAL: MONGO_URI is missing from process.env when initializing Agenda.');
}

const agenda = new Agenda({
  db: {
    address: MONGO_URI,
    collection: 'agendaJobs',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  }
});

// Define the job to delete expired stories
agenda.define('delete expired stories', async (job) => {
  try {
    const now = new Date();
    const result = await Story.deleteMany({ expiresAt: { $lt: now } });
    if (result.deletedCount > 0) {
      console.log(`[Agenda] Successfully deleted ${result.deletedCount} expired stories.`);
    }
  } catch (error) {
    console.error('[Agenda] Error in delete expired stories job:', error);
  }
});

/**
 * Starts the Agenda scheduler and registers/schedules the delete expired stories job.
 */
async function startAgenda() {
  try {
    console.log('[Agenda] Starting background scheduler...');
    await agenda.start();
    
    // Schedule to run every minute
    await agenda.every('1 minute', 'delete expired stories');
    console.log('[Agenda] Background job scheduler started and scheduled to run every 1 minute.');
  } catch (error) {
    console.error('[Agenda] Failed to start Agenda scheduler:', error);
  }
}

/**
 * Stops the Agenda scheduler gracefully.
 */
async function stopAgenda() {
  try {
    console.log('[Agenda] Stopping background scheduler...');
    await agenda.stop();
    console.log('[Agenda] Background scheduler stopped successfully.');
  } catch (error) {
    console.error('[Agenda] Error stopping Agenda scheduler:', error);
  }
}

module.exports = {
  agenda,
  startAgenda,
  stopAgenda
};
