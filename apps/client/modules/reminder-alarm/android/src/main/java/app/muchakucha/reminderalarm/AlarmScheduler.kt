package app.muchakucha.reminderalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/** Registers stored alarms with the system's alarm service. */
object AlarmScheduler {
  private const val SCHEME = "reminder-alarm"
  private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  /** Replaces whatever was registered under the same id in the same store. */
  fun arm(context: Context, alarm: Alarm, store: AlarmStore) {
    val manager = context.getSystemService(AlarmManager::class.java)
    val operation = fireIntent(context, alarm.id, store)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()) {
      // An alarm clock fires on time through Doze, and the status bar shows it as the next alarm.
      manager.setAlarmClock(AlarmManager.AlarmClockInfo(alarm.fireAt, showIntent(context)), operation)
    } else {
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.fireAt, operation)
    }
  }

  fun disarm(context: Context, id: String, store: AlarmStore) {
    context.getSystemService(AlarmManager::class.java).cancel(fireIntent(context, id, store))
  }

  /** Registers every stored alarm still ahead again, and forgets the ones whose moment has passed. */
  fun rearmAll(context: Context) {
    val now = System.currentTimeMillis()
    for (store in AlarmStore.both(context)) {
      for (alarm in store.all()) {
        if (alarm.fireAt <= now) store.remove(alarm.id) else arm(context, alarm, store)
      }
    }
  }

  /** Which store a fired alarm lives in, and its id. */
  fun target(context: Context, intent: Intent): Pair<AlarmStore, String>? {
    val data = intent.data ?: return null
    if (data.scheme != SCHEME) return null
    val id = data.lastPathSegment ?: return null
    return (if (data.authority == "snoozed") AlarmStore.snoozed(context) else AlarmStore.scheduled(context)) to id
  }

  // The data makes each alarm's intent distinct, so registering one never replaces another.
  private fun fireIntent(context: Context, id: String, store: AlarmStore): PendingIntent {
    val data = Uri.Builder().scheme(SCHEME).authority(if (store.snoozed) "snoozed" else "scheduled").appendPath(id).build()
    return PendingIntent.getBroadcast(context, 0, Intent(context, AlarmReceiver::class.java).setData(data), FLAGS)
  }

  private fun showIntent(context: Context): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent(context, AlarmActivity::class.java)
    return PendingIntent.getActivity(context, 0, launch, FLAGS)
  }
}
