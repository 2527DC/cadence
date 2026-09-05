// The weekly review's cards. P11.
//
// These live here rather than beside the screen for the same reason review-model.ts
// does: expo-router turns every file under src/app into a route, so a component module
// dropped in there would become a navigable URL.
//
// Not one of these components computes a rate. Everything numeric arrives already
// derived — from v_week_rollup via metrics.thisWeek/weekOverWeek/goalScorecards, or
// from a frozen snapshot — and is only formatted here with formatRate/formatPoints,
// which are the same functions the dashboard uses. That is deliberate: two places
// calculating a completion rate is two places for it to be wrong differently.

import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { StatusEvent } from '@/api/reviews';
import type { Task } from '@/api/tasks';
import { Button, Card, STATUS_META, StatusPill, Text } from '@/components/ui';
import { ProgressBar, SegmentedBar, StatusLegend } from '@/features/analytics/charts';
import {
  MIN_COUNTED_FOR_KEPT,
  formatPoints,
  formatRate,
  type GoalScorecard,
  type ThisWeek,
} from '@/features/analytics/metrics';
import { VoiceNotePlayer } from '@/features/voice';

import type { ReviewStats } from './review-model';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text variant="micro" className="mt-6 tracking-wider uppercase">
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Still open — first on the screen
// ---------------------------------------------------------------------------

/**
 * The tasks the week ended without an answer to.
 *
 * They are at the top because they are the only thing on this screen that can still
 * change, and because leaving one open is a real choice with a real cost: an OPEN task
 * stays in the week's denominator. The card says so rather than implying that closing
 * them is housekeeping.
 *
 * Each one is closed on its own, through the same sheet as everywhere else, because
 * each one needs its own note. There is no bulk close and no shared note — close_task()
 * would reject one anyway, and a note that covers four tasks explains none of them.
 */
export function StillOpenSection({
  tasks,
  onClose,
}: {
  tasks: Task[];
  onClose: (task: Task) => void;
}) {
  if (tasks.length === 0) return null;

  return (
    <>
      <SectionTitle>Still open · {tasks.length}</SectionTitle>

      <Card className="mt-2">
        <Text variant="meta">
          The week ended without an answer to {tasks.length === 1 ? 'this' : 'these'}. Closing each
          one needs its own note — there is no way to answer for all of them at once, and there
          should not be.
        </Text>
        <Text variant="micro" className="mt-2">
          Skipping is allowed. They stay open and keep counting in the week&apos;s denominator,
          which is the honest cost of not deciding.
        </Text>
      </Card>

      <View className="mt-2 gap-2">
        {tasks.map((task) => (
          <Card key={task.id} className={`border-l-4 ${STATUS_META[task.status].cardBorder}`}>
            <View className="gap-3 flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="font-semibold">{task.title}</Text>
                {task.late_add ? (
                  <Text variant="micro" className="text-warn dark:text-warn-dark mt-0.5">
                    late add
                  </Text>
                ) : null}
              </View>
              <StatusPill status={task.status} />
            </View>
            <Button
              label="Close it"
              variant="secondary"
              className="mt-3"
              onPress={() => onClose(task)}
            />
          </Card>
        ))}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

/**
 * The week's own figures. Every one of them comes off v_week_rollup through
 * metrics.thisWeek(); nothing here divides anything.
 *
 * The NC count sits next to the rate, as it does everywhere else in this app: NC is
 * excluded from the denominator by design, so a rate shown without it is a rate that
 * can be made to look like anything.
 */
export function WeekNumbersCard({ week, threshold }: { week: ThisWeek; threshold: number }) {
  return (
    <Card className="mt-2">
      <SegmentedBar
        completed={week.completed}
        missed={week.missed}
        notCounted={week.notCounted}
        open={week.open}
      />

      <View className="mt-3 flex-row items-end justify-between">
        <View>
          <Text className="text-4xl font-bold">{formatRate(week.rate)}</Text>
          <Text variant="micro" className="mt-0.5">
            {plural(week.counted, 'counted task')}
          </Text>
        </View>
        <View className="items-end">
          <Text variant="meta">
            C {week.completed} · N {week.missed} · NC {week.notCounted}
          </Text>
          <Text variant="micro" className="mt-0.5">
            {week.open > 0 ? `${plural(week.open, 'task')} still open` : 'nothing left open'}
            {week.total === 0 ? ' · nothing was committed' : ''}
          </Text>
        </View>
      </View>

      {week.notCounted > 0 ? (
        <Text variant="micro" className="mt-2">
          {plural(week.notCounted, 'task')} not counted — {formatRate(week.ncRate)} of the week,
          left out of the rate above.
        </Text>
      ) : null}

      <Text variant="micro" className="mt-2">
        {week.isKeptSoFar
          ? `A kept week: ${MIN_COUNTED_FOR_KEPT}+ counted tasks at ${Math.round(threshold * 100)}% or better.`
          : week.keptShortfall > 0
            ? `Not a kept week — it needed ${plural(week.keptShortfall, 'more counted task')} before the rate could even qualify.`
            : `Not a kept week — below ${Math.round(threshold * 100)}%.`}
      </Text>

      <View className="mt-3">
        <StatusLegend />
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Late adds
// ---------------------------------------------------------------------------

/**
 * doc/05 §4.2, shown for the week being reviewed: the rate with the late adds and the
 * rate without them, side by side.
 *
 * A late add is a task committed after Wednesday of its own week — computed by the
 * database at finalization, never sent by the client. It is not cheating and it is not
 * treated as such here; it is just visible, which is enough. Committing on Thursday to
 * something already half done is the thing you would rather the record did not show,
 * so the record shows it.
 */
export function LateAddsSection({ week, tasks }: { week: ThisWeek; tasks: Task[] }) {
  const split = week.lateAdds;
  if (split.lateAdds === 0) return null;

  return (
    <>
      <SectionTitle>Late adds · {split.lateAdds}</SectionTitle>

      <Card className="mt-2">
        <Text variant="meta">
          {plural(split.lateAdds, 'task')} of {split.finalized} committed after Wednesday.
        </Text>

        <View className="mt-3 flex-row items-baseline justify-between">
          <View>
            <Text variant="micro">with them</Text>
            <Text className="mt-0.5 text-2xl font-bold">{formatRate(split.withRate)}</Text>
          </View>
          <View className="items-end">
            <Text variant="micro">without them</Text>
            <Text className="mt-0.5 text-2xl font-bold">{formatRate(split.withoutRate)}</Text>
          </View>
        </View>

        <Text variant="micro" className="mt-3">
          {split.withRate === null || split.withoutRate === null
            ? 'Not enough counted tasks on one side to compare the two.'
            : split.differs
              ? `More than 10 points apart. ${
                  split.withRate > split.withoutRate
                    ? 'The late adds are flattering the week.'
                    : 'The late adds are the ones that got squeezed out.'
                }`
              : 'The two are close, so the late adds are not what moved the number.'}
        </Text>

        <View className="mt-3 gap-1">
          {tasks.map((t) => (
            <View key={t.id} className="gap-2 flex-row items-center">
              <View className={`h-2 w-2 rounded-full ${STATUS_META[t.status].dot}`} />
              <Text variant="meta" className="flex-1">
                {t.title}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

/**
 * Per-goal attainment for the week, straight out of v_goal_progress via
 * goalScorecards(). `attainment` is the view's own number — completed over target,
 * capped at 1 — and is not recomputed here.
 */
export function GoalAttainmentSection({ goals }: { goals: GoalScorecard[] }) {
  if (goals.length === 0) return null;

  return (
    <>
      <SectionTitle>Goals this week</SectionTitle>
      <Card className="mt-2 gap-3">
        {goals.map((g) => (
          <View key={g.goalId}>
            <View className="mb-1 flex-row items-baseline justify-between">
              <Text className="mr-3 font-semibold flex-1">{g.title}</Text>
              <Text variant="meta">
                {g.completedThisWeek} / {g.target}
              </Text>
            </View>
            <ProgressBar fraction={g.attainment} color={g.color} />
            <Text variant="micro" className="mt-1">
              {formatRate(g.attainment)} of the target
              {g.state === 'archived' ? ' · archived' : ''}
            </Text>
          </View>
        ))}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// What was closed, and what was said
// ---------------------------------------------------------------------------

export type ClosedEntry = {
  task: Task;
  event: StatusEvent | null;
  corrections: number;
};

/**
 * Every task closed in the week, with the note behind it.
 *
 * The note is read from task_status_events, not from the task, because that table is
 * append-only: a correction adds a row and keeps the first. Where a task has more than
 * one entry the latest is shown — that is the answer that stands — and the count of
 * earlier ones is stated rather than hidden.
 *
 * Nothing here is editable and nothing is deletable. Tapping a row opens the task, not
 * an edit form.
 */
export function ClosedSection({
  entries,
  onOpen,
}: {
  entries: ClosedEntry[];
  onOpen: (task: Task) => void;
}) {
  return (
    <>
      <SectionTitle>Closed this week · {entries.length}</SectionTitle>

      {entries.length === 0 ? (
        <Card className="mt-2">
          <Text variant="meta">Nothing was closed in this week.</Text>
        </Card>
      ) : (
        <View className="mt-2 gap-2">
          {entries.map(({ task, event, corrections }) => (
            <Card key={task.id} className={`border-l-4 ${STATUS_META[task.status].cardBorder}`}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${task.title}`}
                onPress={() => onOpen(task)}>
                <View className="gap-3 flex-row items-start justify-between">
                  <Text className="font-semibold flex-1">{task.title}</Text>
                  <StatusPill status={task.status} />
                </View>

                <Text variant="micro" className="mt-1">
                  {STATUS_META[task.status].meaning}
                  {task.nc_reason ? ` · ${task.nc_reason.replace(/_/g, ' ')}` : ''}
                  {task.late_add ? ' · late add' : ''}
                  {corrections > 0
                    ? ` · corrected ${corrections === 1 ? 'once' : `${corrections} times`}`
                    : ''}
                </Text>
              </Pressable>

              {event?.note ? <Text className="mt-2">{event.note}</Text> : null}

              {event?.voice_note_id ? (
                <View className="mt-2">
                  <VoiceNotePlayer voiceNoteId={event.voice_note_id} />
                </View>
              ) : null}

              {!event ? (
                <Text variant="micro" className="mt-2">
                  The note for this one has not arrived on this device yet.
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Drafts that were never committed
// ---------------------------------------------------------------------------

/**
 * Visible, but not failures.
 *
 * A draft was never a promise — it is not in the completion rate and it never was. But
 * a week of drafts that never got committed is a week you did not commit to anything,
 * and that is exactly the pattern the guardrails exist to catch, so it is said out loud
 * rather than left off the page.
 */
export function DraftsSection({ drafts }: { drafts: Task[] }) {
  if (drafts.length === 0) return null;

  return (
    <>
      <SectionTitle>Not committed · {drafts.length}</SectionTitle>
      <Card className="mt-2" draft>
        <Text variant="meta">
          {plural(drafts.length, 'task')} stayed a draft all week. Not failures — they were never
          commitments — but they are not in any number on this page either.
        </Text>
        <View className="mt-3 gap-1">
          {drafts.map((d) => (
            <Text key={d.id} variant="meta">
              · {d.title}
            </Text>
          ))}
        </View>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// The snapshot
// ---------------------------------------------------------------------------

/**
 * What the numbers were when the review was written, and whether they have moved since.
 *
 * The snapshot is the point of the whole phase: reopen a task from three weeks ago and
 * that week's review still shows what you saw when you wrote it. When the live view has
 * since drifted, both are shown and the difference is named — hiding either one would
 * be a different kind of lie.
 */
export function SnapshotCard({ stats, drift }: { stats: ReviewStats; drift: string | null }) {
  const capturedAt = stats.captured_at ? new Date(stats.captured_at) : null;

  return (
    <Card className="mt-2">
      <Text variant="micro" className="tracking-wider uppercase">
        Recorded at review time
      </Text>

      <Text variant="meta" className="mt-2">
        {formatRate(stats.completion_rate)} · C {stats.completed} · N {stats.missed} · NC{' '}
        {stats.not_counted}
        {stats.still_open > 0 ? ` · ${stats.still_open} open` : ''}
        {stats.rate_delta !== null ? ` · ${formatPoints(stats.rate_delta)} on the week before` : ''}
      </Text>

      {capturedAt && !Number.isNaN(capturedAt.getTime()) ? (
        <Text variant="micro" className="mt-1">
          Frozen{' '}
          {capturedAt.toLocaleString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          })}
          . These figures do not move when the tasks behind them are later corrected.
        </Text>
      ) : null}

      {drift ? (
        <Text variant="micro" className="mt-2">
          The week has changed since: {drift}. Saving again records the new figures; the ones above
          are what you actually reviewed.
        </Text>
      ) : null}
    </Card>
  );
}
