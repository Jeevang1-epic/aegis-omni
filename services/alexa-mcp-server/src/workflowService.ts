import { z } from 'zod';
import { BeeContextService, BeeTodoInputSchema } from './beeContextService.js';
import { CaretakingRegistry } from './ringWhepService.js';
export const BroadcastEventSchema = z.object({ at: z.number().finite().nonnegative(), description: z.string().min(1).max(500) });
export const CatchUpSchema = z.object({ startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().nonnegative(), events: z.array(BroadcastEventSchema).max(200).default([]) });
export function generateBroadcastCatchup(input: unknown) {
  const { startSeconds, endSeconds, events } = CatchUpSchema.parse(input);
  if (endSeconds < startSeconds || endSeconds - startSeconds > 86400) throw new Error('Invalid catch-up interval');
  const missed = events.filter(event => event.at > startSeconds && event.at <= endSeconds).sort((a, b) => a.at - b.at);
  return { startSeconds, endSeconds, durationSeconds: endSeconds - startSeconds, events: missed,
    summary: missed.length ? missed.map(event => event.description).join(' ') : 'No annotated play in this interval.', source: 'annotated-timeline', modelInvoked: false };
}
export class AegisServices {
  constructor(public bee = new BeeContextService(), public care = new CaretakingRegistry()) {}
  async execute(name: string, args: unknown) {
    switch (name) {
      case 'query_household_care_status': return { events: this.care.list(), facts: await this.bee.facts(), source: 'simulator' };
      case 'create_caretaking_followup_todo': return this.bee.createTodo(BeeTodoInputSchema.parse(args));
      case 'generate_live_broadcast_catchup': return generateBroadcastCatchup(args);
      case 'dispatch_perimeter_resolution': {
        const { eventId, actionType } = z.object({ eventId: z.string().min(1), actionType: z.enum(['acknowledge', 'announce_voice_directive', 'bookmark_tv_timestamp']) }).parse(args);
        return { event: this.care.resolve(eventId), actionType, status: 'simulated', physicalActionExecuted: false };
      }
      default: throw new Error('Unknown MCP tool');
    }
  }
}
