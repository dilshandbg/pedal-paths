import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { AssistantSection } from '@/features/assistant/components/AssistantSection';
import { useAssistantStore } from '@/features/assistant/store/assistantStore';
import { SYNTHETIC_ANALYTICS } from '../../server/assistant/evaluation';
import { createProviderRegistry } from '../../server/assistant/llm/registry';
import { createAssistantService, type AssistantService } from '../../server/assistant/service';
import { openSettingsFile } from '../../server/assistant/settingsFile';
import { createAssistantApi } from '../../server/http/assistantApi';
import {
  analyst,
  answerFrom,
  createFakeProvider,
  fakeModel,
  type FakeProvider,
} from '../server/assistant/fakeProvider';

/*
 * UX-13 / UX-14: the Assistant section end to end in the browser environment. The screens, store
 * and client talk through fetch to the REAL local assistant API and service on a local HTTP server,
 * with the fake provider at the end. No Ollama, no network.
 */

vi.setConfig({ testTimeout: 20_000 });

// jsdom has no Web Workers or ride backend: an in-memory ride history replaces both.
vi.mock('@/features/activities/store/rideHistoryServices', async () => ({
  rideHistoryServices: (await import('../mocks/fakeRideHistory')).fakeRideHistory.services,
}));

// The real fetch, kept before the test setup blocks network access.
const realFetch = globalThis.fetch;

let server: Server;
let origin: string;
let provider: FakeProvider;
let service: AssistantService;

beforeEach(async () => {
  useAssistantStore.setState(useAssistantStore.getInitialState(), true);
  provider = createFakeProvider({ id: 'ollama', respond: analyst() });
  const registry = createProviderRegistry([
    {
      descriptor: {
        id: 'ollama',
        displayName: 'Local test provider',
        location: 'local',
        settings: [
          {
            key: 'serverUrl',
            label: 'Provider address',
            kind: 'local-url',
            defaultValue: 'http://127.0.0.1:11434',
            help: 'Where the provider listens.',
          },
        ],
        modelLibrary: { url: 'https://models.example/search', label: 'Browse models' },
      },
      create: () => provider,
    },
  ]);
  service = createAssistantService({
    registry,
    file: openSettingsFile(null),
    analytics: () => SYNTHETIC_ANALYTICS,
    history: () => ({ rideCount: 62, firstRideDate: '2018-01-06', lastRideDate: '2019-06-29' }),
    timeZone: 'UTC',
    clock: () => new Date('2020-01-15T12:00:00Z'),
    log: () => {},
  });
  const api = createAssistantApi(() => service);
  server = createServer((req, res) =>
    api(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Only the local assistant API is reachable, as in the app.
  vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) =>
    realFetch(new URL(String(input), origin), init),
  );
});

afterEach(async () => {
  useAssistantStore.getState().newConversation();
  service.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const setup = () => {
  const user = userEvent.setup();
  render(<AssistantSection />);
  return user;
};

const openSettings = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('tab', { name: 'Settings' }));
  return screen.findByRole('list', { name: 'Installed models' });
};

const modelCard = (id: string) => within(screen.getByRole('listitem', { name: id }));

/** Selects and tests qwen3:8b in the settings, then goes back to the chat. */
async function getReady(user: ReturnType<typeof userEvent.setup>) {
  await openSettings(user);
  await user.click(screen.getByRole('button', { name: 'Select qwen3:8b' }));
  await waitFor(() =>
    expect(modelCard('qwen3:8b').getByText('Selected', { selector: 'span' })).toBeInTheDocument(),
  );
  await user.click(screen.getByRole('button', { name: 'Test qwen3:8b' }));
  expect(await screen.findByText(/qwen3:8b passed the test/)).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Chat' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument());
}

async function ask(user: ReturnType<typeof userEvent.setup>, question: string) {
  await user.type(screen.getByLabelText('Your question'), question);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ask' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  return screen.findByRole('article', { name: `Answer to: ${question}` });
}

describe('UX-13 / AC-43: asking about the rides', () => {
  it('answers from the analytics, streamed, and shows the analytics used', async () => {
    const user = setup();
    await getReady(user);
    const answer = await ask(user, 'How far did I ride in each month of 2019?');
    await waitFor(() => expect(answer).toHaveAttribute('aria-busy', 'false'));
    expect(
      within(answer).getByText('2019-03: 487.3 km; 2019-04: 312.8 km; 2019-06: 655.1 km'),
    ).toBeInTheDocument();
    expect(within(answer).getByRole('list', { name: 'Analytics used' })).toHaveTextContent(
      'distance by month, 2019-01-01 – 2019-12-31',
    );
    expect(within(answer).queryByText(/Check this answer/)).not.toBeInTheDocument();
  });

  it('warns about numbers that did not come from the analytics (AC-55)', async () => {
    const user = setup();
    await getReady(user);
    provider.respondWith(
      analyst({
        answer: (name, content) => `${answerFrom(name, content)} About 37% more than average.`,
      }),
    );
    const answer = await ask(user, 'How far did I ride in each month of 2019?');
    expect(
      await within(answer).findByText(
        'Check this answer: the number 37 did not come from your ride analytics.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the conversation, and starts a new one on request', async () => {
    const user = setup();
    await getReady(user);
    await ask(user, 'How far did I ride in each month of 2019?');
    await ask(user, 'Compare my total distance in 2018 with 2019.');
    expect(
      within(screen.getByRole('list', { name: 'Conversation' })).getAllByRole('article'),
    ).toHaveLength(2);
    expect(provider.requests.at(-1)?.messages[0]).toEqual({
      role: 'user',
      text: 'How far did I ride in each month of 2019?',
    });
    await user.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByRole('list', { name: 'Conversation' })).not.toBeInTheDocument();
  });
});

describe('AC-52 / AC-53: Stop and failures', () => {
  it('stops an answer, which cancels the request to the model', async () => {
    const user = setup();
    await getReady(user);
    provider.respondWith([{ text: ['Part one '], hang: true }]);
    const answer = await ask(user, 'Tell me everything.');
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    expect(await within(answer).findByText('Stopped.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
  });

  it('shows a plain message when the model fails, and the chat goes on', async () => {
    const user = setup();
    await getReady(user);
    provider.respondWith([{ text: 'no' }]); // a well-behaved answer, but…
    provider.setModels([]); // …the model disappeared before the question
    const answer = await ask(user, 'How far in 2019?');
    expect(await within(answer).findByRole('alert')).toHaveTextContent(/not installed/);
  });
});

describe('RULE-26 / AC-46 / AC-50: nothing is sent until a tested model is ready', () => {
  it('blocks the chat without a model, and links to the settings', async () => {
    const user = setup();
    expect(
      await screen.findByText(/Choose a model in the assistant settings first/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Open the assistant settings' }));
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
  });

  it('blocks the chat with an untested model, and sends nothing', async () => {
    const user = setup();
    await openSettings(user);
    await user.click(screen.getByRole('button', { name: 'Select qwen3:8b' }));
    await user.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(await screen.findByText(/Test the selected model/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    expect(provider.requests).toEqual([]);
  });

  it('says the provider is not reachable, and how to fix it', async () => {
    provider.setReachable(false);
    const user = setup();
    expect(await screen.findByText(/is not reachable/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not reachable/);
  });
});

describe('UX-14 / AC-46: connection settings', () => {
  it('shows the status, tests the connection and refuses an address on another computer', async () => {
    const user = setup();
    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(
      await screen.findByText(/Connected to Local test provider fake-1.0/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(
      await screen.findByText('Connected to Local test provider, version fake-1.0.'),
    ).toBeInTheDocument();

    const address = screen.getByLabelText('Provider address');
    await user.clear(address);
    await user.type(address, 'http://192.168.1.20:11434');
    await user.click(screen.getByRole('button', { name: 'Save address' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/must be on this computer/);
    expect(service.settings().serverUrl).toBe('http://127.0.0.1:11434');
  });
});

describe('UX-14 / AC-47 – AC-51: models', () => {
  it('lists models with details, and marks a cloud model as not used', async () => {
    provider.setModels([fakeModel('qwen3:8b'), fakeModel('gpt-oss:120b-cloud')]);
    const user = setup();
    await openSettings(user);
    expect(
      modelCard('qwen3:8b').getByText('8.0B · Q4_K_M · 4.7 GB · 32,768-token context'),
    ).toBeInTheDocument();
    expect(modelCard('qwen3:8b').getByText(/Not tested/)).toBeInTheDocument();
    expect(modelCard('gpt-oss:120b-cloud').getByText(/Cloud model/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select gpt-oss:120b-cloud' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Browse models' })).toHaveAttribute(
      'href',
      'https://models.example/search',
    );
  });

  it('shows why a model failed the test', async () => {
    provider.respondWith(analyst({ answer: () => 'I looked it up.' }));
    const user = setup();
    await openSettings(user);
    await user.click(screen.getByRole('button', { name: 'Test qwen3:8b' }));
    expect(await screen.findByText(/did not pass the test/)).toBeInTheDocument();
    // The list is refreshed after the notice.
    expect(await modelCard('qwen3:8b').findByText(/Failed the test/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Test results for qwen3:8b' })).getByText(
        'The answer does not give the monthly distances from the tool result.',
      ),
    ).toBeInTheDocument();
  });

  it('removes the selected model after confirming, and says the selection is gone (AC-49)', async () => {
    const user = setup();
    await openSettings(user);
    await user.click(screen.getByRole('button', { name: 'Select qwen3:8b' }));
    await user.click(await screen.findByRole('button', { name: 'Remove qwen3:8b' }));
    expect(provider.removeRequests).toEqual([]); // nothing removed before confirming
    await user.click(screen.getByRole('button', { name: 'Remove model' }));
    expect(
      await screen.findByText(
        'qwen3:8b was removed. It was the selected model, so choose another one.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText(/No models are installed yet/)).toBeInTheDocument();
    expect(service.settings().model).toBeNull();
  });
});

describe('AC-48: downloading models', () => {
  it('shows progress until the model is downloaded and listed', async () => {
    const user = setup();
    await openSettings(user);
    await user.type(screen.getByLabelText('Model name'), 'llama3.2');
    await user.click(screen.getByRole('button', { name: 'Download' }));
    const entry = within(await screen.findByRole('listitem', { name: 'Download of llama3.2' }));
    expect(await entry.findByText('Downloaded. Test it before asking.')).toBeInTheDocument();
    expect(await screen.findByRole('listitem', { name: 'llama3.2' })).toBeInTheDocument();
  });

  it('cancels a download', async () => {
    const hanging = createFakeProvider({
      id: 'ollama',
      install: () => ({
        steps: [{ status: 'pulling', completedBytes: 1e9, totalBytes: 4e9 }],
        hang: true,
      }),
    });
    provider.models = hanging.models;
    const user = setup();
    await openSettings(user);
    await user.type(screen.getByLabelText('Model name'), 'llama3.2');
    await user.click(screen.getByRole('button', { name: 'Download' }));
    const entry = within(await screen.findByRole('listitem', { name: 'Download of llama3.2' }));
    expect(await entry.findByText('Pulling: 1.0 GB of 4.0 GB (25%)')).toBeInTheDocument();
    await user.click(entry.getByRole('button', { name: 'Cancel download of llama3.2' }));
    expect(await entry.findByText('Cancelled. You can start it again.')).toBeInTheDocument();
    await waitFor(() => expect(service.downloads.get('llama3.2')?.status).toBe('cancelled'));
  });

  it('refuses a cloud model before downloading anything', async () => {
    const user = setup();
    await openSettings(user);
    await user.type(screen.getByLabelText('Model name'), 'gpt-oss:120b-cloud');
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(await screen.findByText(/Cloud models run outside this computer/)).toBeInTheDocument();
    expect(provider.installRequests).toEqual([]);
  });
});

describe('UX-13 / AC-46: the Assistant section in the app', () => {
  it('opens from the sidebar, and the rest of the app keeps working without the provider', async () => {
    provider.setReachable(false);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: 'Assistant' }));
    expect(await screen.findByText(/is not reachable/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Rides' }));
    await waitFor(() => expect(screen.getByLabelText('Strava export ZIP file')).toBeEnabled(), {
      timeout: 15_000,
    });
  });
});
