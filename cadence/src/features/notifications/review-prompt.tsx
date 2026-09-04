// "Your week is ready to review." P11.
//
// The notification is a convenience, not the mechanism. Permission can be refused, a
// phone can be on silent, a banner can be swiped away without being read — and if the
// only route into the weekly review is a notification, then a refused permission
// quietly removes the ritual the whole app is built around.
//
// So this card is the other route: it lives in the app, it says the same thing, and it
// is what makes the P11 acceptance criterion "permission denied → the review screen
// still works, just unprompted" true rather than aspirational.
//
// It is deliberately quiet once the review is written. A prompt that stays up after
// you have done the thing is the beginning of nagging.

import { useRouter } from 'expo-router';

import { useWeekReview } from '@/api/reviews';
import { Button, Card, Text } from '@/components/ui';
import { formatWeekRange, type DateString } from '@/lib/week';

import { reviewHref } from './routes';

/**
 * `weekStart` is the week being offered for review — normally the week that just
 * ended, i.e. shiftWeek(currentWeekStart(), -1).
 */
export function ReviewPrompt({ weekStart }: { weekStart: DateString }) {
  const router = useRouter();
  const review = useWeekReview(weekStart);

  // While it is loading, say nothing. A card that appears and then changes its mind
  // about what it says is worse than one that arrives a moment late.
  if (review.isPending) return null;

  const done = review.data !== null && review.data !== undefined;
  const recordedAt = done && review.data ? new Date(review.data.created_at) : null;

  return (
    <Card className="mt-4">
      <Text variant="micro" className="tracking-wider uppercase">
        {done ? 'Reviewed' : 'Weekly review'}
      </Text>

      <Text variant="heading" className="mt-2">
        {formatWeekRange(weekStart)}
      </Text>

      <Text variant="meta" className="mt-1">
        {done
          ? `Written ${recordedAt?.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              timeZone: 'Asia/Kolkata',
            })}. The numbers in it are frozen as they were that day.`
          : 'How did that week actually go? Five minutes, and it is the part that turns the record into a practice.'}
      </Text>

      <Button
        label={done ? 'Read it again' : 'Review the week'}
        variant={done ? 'secondary' : 'primary'}
        className="mt-4"
        onPress={() => router.push(reviewHref(weekStart))}
      />
    </Card>
  );
}
