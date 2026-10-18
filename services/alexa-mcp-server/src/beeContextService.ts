import { z } from 'zod';
export const BeeContextQuerySchema = z.object({ query: z.string().trim().min(1).max(1000), limit: z.number().int().min(1).max(10).default(3) });
export const BeeTodoInputSchema = z.object({ text: z.string().trim().min(1).max(1000), alarm_at: z.string().datetime({ offset: true }).nullable() });
const EpochSchema = z.number().int().min(0).max(8640000000000000);
const TodoSchema = z.object({ id: z.union([z.string(), z.number()]).transform(String), text: z.string(), alarm_at: EpochSchema.nullable(), completed: z.boolean().default(false) });
export type BeeTodo = z.infer<typeof TodoSchema>;
const FactsSchema = z.array(z.object({ id: z.union([z.string(), z.number()]).transform(String), text: z.string(), confirmed: z.boolean().optional() }));
export class BeeContextService {
  private todos: BeeTodo[] = [];
  constructor(private options: { mode?: 'simulator' | 'proxy'; proxyUrl?: string; fetcher?: typeof fetch } = {}) {}
  get source() { return this.options.mode === 'proxy' ? 'bee-proxy-live' : 'bee-deterministic-sandbox'; }
  private async proxy(path: string, body?: unknown): Promise<unknown> {
    const response = await (this.options.fetcher ?? fetch)(`${this.options.proxyUrl ?? 'http://127.0.0.1:8787'}${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(3000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Bee proxy returned ${response.status}`);
    return response.json();
  }
  async createTodo(input: unknown) {
    const parsed = BeeTodoInputSchema.parse(input);
    if (this.todos.length >= 1000) throw new Error('Todo capacity reached');
    const todo = this.options.mode === 'proxy' ? TodoSchema.parse(await this.proxy('/v1/todos', parsed)) : TodoSchema.parse({ id: `todo-${this.todos.length + 1}`, text: parsed.text, alarm_at: parsed.alarm_at === null ? null : Date.parse(parsed.alarm_at) });
    this.todos.push(todo);
    return { ...todo, alarmAtIso: todo.alarm_at === null ? null : new Date(todo.alarm_at).toISOString(), source: this.source };
  }
  async facts() {
    if (this.options.mode === 'proxy') {
      const data = await this.proxy('/v1/facts');
      return FactsSchema.parse(Array.isArray(data) ? data : z.object({ facts: FactsSchema }).parse(data).facts);
    }
    return [{ id: 'fact-1', text: 'Pharmacy delivery expected; inspect cooler indicator.', confirmed: true }, { id: 'fact-2', text: 'Garden walks are part of the household routine.', confirmed: true }, { id: 'fact-3', text: 'Visual doorbell relay preferred.', confirmed: true }];
  }
  listTodos() { return this.todos.map(todo => ({ ...todo })); }
  streamEvents() {
    return [{ type: 'new-utterance', data: { utterance: { text: 'Pharmacy parcel expected today', speaker: 'household-member' }, conversation_uuid: 'demo-conversation' } },
      ...this.todos.map(todo => ({ type: 'todo-created', data: { todo: { ...todo, alarmAt: todo.alarm_at } } })),
      { type: 'update-conversation-summary', data: { conversation_id: 1, short_summary: 'Household delivery and check-in notes.' } }];
  }
  async correlate(input: unknown) {
    const { query, limit } = BeeContextQuerySchema.parse(input);
    if (this.options.mode === 'proxy') return { query, source: this.source, results: await this.proxy('/v1/search/conversations/neural', { query, limit }), facts: await this.facts() };
    const facts = await this.facts();
    const queryWords = query.toLowerCase().split(/\W+/).filter(word => word.length > 2);
    const matches = facts.filter(fact => queryWords.some(word => fact.text.toLowerCase().includes(word))).slice(0, limit);
    const epoch = 1791984600000;
    return { query, source: this.source, matches, matchedUtterance: matches[0]?.text ?? 'No matching household note.', confirmedFact: matches[0]?.text ?? null,
      todoItem: { id: 'sample-todo', text: 'Check delivery receipt', alarmAtIso: new Date(epoch).toISOString(), alarmAtEpochMs: epoch }, sampleTodo: true };
  }
}
export async function correlateBeeAmbientMemory(input: unknown) { return new BeeContextService().correlate(input); }
