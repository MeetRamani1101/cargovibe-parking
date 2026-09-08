import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  STATUS_LABELS,
  TRANSITION_LABELS,
  type AssistantResponse,
  type ParkingRequest,
} from '@cargovibe/shared';

import { askAssistant } from '../src/api/assistant';
import { Button } from '../src/components/Button';
import { FeedbackBanner, type Feedback } from '../src/components/FeedbackBanner';
import { RequestCard } from '../src/components/RequestCard';
import { errorMessage } from '../src/components/ScreenState';
import { StatusTransitionDialog } from '../src/components/StatusTransitionDialog';
import { useUpdateParkingRequestStatus } from '../src/hooks/useParkingRequests';
import { CONTENT_MAX_WIDTH, WIDE_LAYOUT_BREAKPOINT, colors, radius, spacing } from '../src/theme';

const EXAMPLES = [
  'Which requests are still pending?',
  'Show me all approved tankers.',
  'Which requests are scheduled for tonight?',
  'Are there any unusually long parking requests?',
  'What should I do next?',
];

/**
 * The AI extension.
 *
 * The screen only ever *reads* through `POST /assistant/query`. When the answer
 * carries a `suggestedAction`, it is rendered as a proposal with an explicit
 * "Apply…" button that opens the same confirmation dialog the detail screen
 * uses. Nothing is written until the operator confirms, and the write goes
 * through the ordinary status endpoint, which re-validates the transition.
 */
export default function AssistantScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_LAYOUT_BREAKPOINT;

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AssistantResponse | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirming, setConfirming] = useState(false);

  const ask = useMutation({
    mutationFn: askAssistant,
    retry: false,
    onSuccess: (response) => {
      setAnswer(response);
      setFeedback(null);
    },
    onError: (error) => setFeedback({ tone: 'error', message: errorMessage(error) }),
  });

  const suggestion = answer?.suggestedAction;
  const suggestionTarget: ParkingRequest | undefined = suggestion
    ? answer?.matches.find((request) => request.id === suggestion.requestId)
    : undefined;

  const applySuggestion = useUpdateParkingRequestStatus(suggestion?.requestId ?? '');

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setQuestion(trimmed);
    ask.mutate(trimmed);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Ask about the current parking requests. The assistant can only read data — any status
          change it proposes has to be confirmed by you.
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="e.g. Which requests are still pending?"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            accessibilityLabel="Question for the parking assistant"
            onSubmitEditing={() => submit(question)}
            returnKeyType="search"
          />
          <Button
            label="Ask"
            onPress={() => submit(question)}
            loading={ask.isPending}
            disabled={question.trim().length === 0}
          />
        </View>

        <View style={styles.examples}>
          {EXAMPLES.map((example) => (
            <Button
              key={example}
              label={example}
              variant="secondary"
              style={styles.example}
              onPress={() => submit(example)}
            />
          ))}
        </View>

        <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} />

        {ask.isPending ? <Text style={styles.thinking}>Thinking…</Text> : null}

        {answer && !ask.isPending ? (
          <View style={styles.answerBlock}>
            <View style={styles.answerCard}>
              <View style={styles.answerHeader}>
                <Text style={styles.answerHeaderText}>
                  {answer.engine === 'deterministic' ? 'Rule-based assistant' : 'LLM assistant'}
                </Text>
                <Text style={styles.answerHeaderText}>
                  {Math.round(answer.confidence * 100)}% confidence
                </Text>
              </View>
              <Text style={styles.answerText}>{answer.answer}</Text>
            </View>

            {suggestion && suggestionTarget ? (
              <View style={styles.suggestionCard}>
                <Text style={styles.suggestionTitle}>Suggested action</Text>
                <Text style={styles.suggestionBody}>
                  {TRANSITION_LABELS[suggestion.targetStatus]} — move from “
                  {STATUS_LABELS[suggestionTarget.status]}” to “
                  {STATUS_LABELS[suggestion.targetStatus]}”.
                </Text>
                <Text style={styles.suggestionReason}>{suggestion.reason}</Text>
                <View style={styles.suggestionActions}>
                  <Button
                    label="Open request"
                    variant="secondary"
                    style={styles.suggestionAction}
                    onPress={() => router.push(`/request/${suggestion.requestId}`)}
                  />
                  <Button
                    label={`${TRANSITION_LABELS[suggestion.targetStatus]}…`}
                    style={styles.suggestionAction}
                    onPress={() => setConfirming(true)}
                    accessibilityHint="Asks for confirmation before changing anything"
                  />
                </View>
              </View>
            ) : null}

            {answer.matches.length > 0 ? (
              <View style={styles.matches}>
                <Text style={styles.matchesTitle}>
                  {answer.matches.length} matching request
                  {answer.matches.length === 1 ? '' : 's'}
                </Text>
                {answer.matches.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    onPress={() => router.push(`/request/${request.id}`)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {suggestionTarget && suggestion ? (
        <StatusTransitionDialog
          request={suggestionTarget}
          target={confirming ? suggestion.targetStatus : null}
          busy={applySuggestion.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={(parkingSpotId) => {
            applySuggestion.mutate(
              {
                status: suggestion.targetStatus,
                ...(parkingSpotId ? { parkingSpotId } : {}),
              },
              {
                onSuccess: (updated) => {
                  setConfirming(false);
                  // The answer is now out of date; drop the suggestion so it
                  // cannot be applied twice.
                  setAnswer((current) =>
                    current
                      ? {
                          ...current,
                          suggestedAction: undefined,
                          matches: current.matches.map((r) => (r.id === updated.id ? updated : r)),
                        }
                      : current,
                  );
                  setFeedback({
                    tone: 'success',
                    message: `${updated.driverName} is now “${STATUS_LABELS[updated.status]}”.`,
                  });
                },
                onError: (error) =>
                  setFeedback({ tone: 'error', message: errorMessage(error) }),
              },
            );
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, width: '100%', alignSelf: 'center' },
  contentWide: { maxWidth: CONTENT_MAX_WIDTH },
  intro: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  inputRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  examples: { gap: spacing.sm },
  example: { alignSelf: 'flex-start' },
  thinking: { fontSize: 14, color: colors.textMuted },
  answerBlock: { gap: spacing.lg },
  answerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  answerHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  answerHeaderText: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  answerText: { fontSize: 15, lineHeight: 22, color: colors.text },
  suggestionCard: {
    backgroundColor: '#fff8e6',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#e6cf9a',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  suggestionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  suggestionBody: { fontSize: 15, fontWeight: '600', color: colors.text },
  suggestionReason: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  suggestionActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  suggestionAction: { flex: 1 },
  matches: { gap: spacing.md },
  matchesTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
