import { useEffect, useMemo, useState } from 'react';
import { AssistantChat } from '@/components/assistant/AssistantChat';
import { ConnectionSettings } from '@/components/assistant/ConnectionSettings';
import { ModelDownloads } from '@/components/assistant/ModelDownloads';
import { ModelList } from '@/components/assistant/ModelList';
import { StatusMessage } from '@/components/assistant/StatusMessage';
import { Panel } from '@/components/common/Panel';
import { Tabs } from '@/components/common/Tabs';
import {
  downloadErrorMessage,
  selectIsAnswering,
  useAssistantStore,
} from '@/features/assistant/store/assistantStore';
import {
  describeDownload,
  describeModel,
  describeStatus,
  describeTurn,
} from '@/features/assistant/utils/describeAssistant';
import { MAX_QUESTION_LENGTH } from '@/features/assistant/utils/limits';

/**
 * The Assistant section (UX-13, UX-14): a chat about the stored rides, and the settings for the
 * local model provider: address and status, installed models, download, test, select and remove.
 * Everything goes through the local assistant API; the provider is named only by the data it sends.
 */
// Implements: BR-39, BR-41, BR-42, BR-43, BR-45, UX-13, UX-14
export function AssistantSection() {
  const [tab, setTab] = useState<'chat' | 'settings'>('chat');
  const load = useAssistantStore((state) => state.load);
  const statusState = useAssistantStore((state) => state.statusState);

  useEffect(() => {
    if (useAssistantStore.getState().statusState === 'idle') void load();
  }, [load]);

  const select = (next: 'chat' | 'settings') => {
    setTab(next);
    // Going back to the chat re-checks whether a question can be sent (RULE-26).
    if (next === 'chat' && statusState !== 'idle')
      void useAssistantStore.getState().refreshStatus();
  };

  return (
    <Tabs
      label="Assistant"
      selected={tab}
      onSelect={select}
      tabs={[
        {
          key: 'chat',
          label: 'Chat',
          content: <ChatContainer onOpenSettings={() => setTab('settings')} />,
        },
        { key: 'settings', label: 'Settings', content: <SettingsContainer /> },
      ]}
    />
  );
}

function ChatContainer({ onOpenSettings }: { onOpenSettings: () => void }) {
  const turns = useAssistantStore((state) => state.turns);
  const status = useAssistantStore((state) => state.status);
  const statusState = useAssistantStore((state) => state.statusState);
  const answering = useAssistantStore(selectIsAnswering);
  const { ask, stop, newConversation } = useAssistantStore.getState();
  const items = useMemo(() => turns.map(describeTurn), [turns]);

  const blocked =
    status?.ready === true
      ? null
      : statusState === 'loading' && !status
        ? { text: 'Checking the assistant…', tone: 'neutral' as const }
        : describeStatus(status, statusState);

  return (
    <Panel title="Ask about your rides" description="Answers are computed from your stored rides.">
      <AssistantChat
        turns={items}
        blocked={blocked}
        answering={answering}
        maxQuestionLength={MAX_QUESTION_LENGTH}
        onAsk={(question) => void ask(question)}
        onStop={stop}
        onNewConversation={newConversation}
      />
      {blocked ? (
        <button
          type="button"
          onClick={onOpenSettings}
          className="self-start text-sm text-orange-700 underline"
        >
          Open the assistant settings
        </button>
      ) : null}
    </Panel>
  );
}

function SettingsContainer() {
  const status = useAssistantStore((state) => state.status);
  const statusState = useAssistantStore((state) => state.statusState);
  const settings = useAssistantStore((state) => state.settings);
  const providers = useAssistantStore((state) => state.providers);
  const models = useAssistantStore((state) => state.models);
  const modelsState = useAssistantStore((state) => state.modelsState);
  const modelsError = useAssistantStore((state) => state.modelsError);
  const downloads = useAssistantStore((state) => state.downloads);
  const connectionTest = useAssistantStore((state) => state.connectionTest);
  const testingConnection = useAssistantStore((state) => state.testingConnection);
  const settingsProblems = useAssistantStore((state) => state.settingsProblems);
  const notice = useAssistantStore((state) => state.notice);
  const actions = useAssistantStore.getState();

  const provider = providers.find((p) => p.id === settings?.provider) ?? providers[0] ?? null;
  const urlSetting = provider?.settings.find((s) => s.kind === 'local-url') ?? null;
  const modelItems = useMemo(() => models.map(describeModel), [models]);
  const downloadItems = useMemo(
    () => Object.values(downloads).map((d) => describeDownload(d, downloadErrorMessage)),
    [downloads],
  );
  const testResult = connectionTest
    ? connectionTest.reachable
      ? {
          text: `Connected${provider ? ` to ${provider.displayName}` : ''}${connectionTest.version ? `, version ${connectionTest.version}` : ''}.`,
          tone: 'ok' as const,
        }
      : { text: connectionTest.message ?? 'Not reachable.', tone: 'error' as const }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Connection" description={provider?.displayName ?? 'Model provider'}>
        <ConnectionSettings
          label={urlSetting?.label ?? 'Server address'}
          help={urlSetting?.help ?? ''}
          serverUrl={settings?.serverUrl ?? urlSetting?.defaultValue ?? ''}
          status={describeStatus(status, statusState)}
          testResult={testResult}
          problems={settingsProblems}
          testing={testingConnection}
          onSave={(url) => void actions.saveServerUrl(url)}
          onTest={(url) => void actions.testConnection(url)}
        />
      </Panel>
      <Panel title="Models" description="Installed on this computer. Only a tested model is used.">
        {notice ? (
          <StatusMessage tone="neutral" role="status">
            {notice}
          </StatusMessage>
        ) : null}
        {modelsState === 'failed' ? (
          <StatusMessage tone="error" role="alert">
            {modelsError ?? 'The models could not be listed.'}
          </StatusMessage>
        ) : modelsState === 'loading' && models.length === 0 ? (
          <p className="text-sm text-slate-600">Loading models…</p>
        ) : (
          <ModelList
            items={modelItems}
            onSelect={(id) => void actions.selectModel(id)}
            onTest={(id) => void actions.testModel(id)}
            onRemove={(id) => void actions.removeModel(id)}
          />
        )}
        <button
          type="button"
          onClick={() => void actions.refreshModels()}
          className="self-start text-sm text-orange-700 underline"
        >
          Refresh the list
        </button>
      </Panel>
      <Panel title="Download a model">
        <ModelDownloads
          downloads={downloadItems}
          library={provider?.modelLibrary ?? null}
          onDownload={(name) => void actions.downloadModel(name)}
          onCancel={actions.cancelDownload}
        />
      </Panel>
    </div>
  );
}
