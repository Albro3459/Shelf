import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
crons.cron('Hourly book availability', '0 * * * *', internal.monitoring.tick);
crons.interval('Recover email workers', { minutes: 5 }, internal.notifications.recover);
export default crons;
