package app.muchakucha.reminderalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build

internal object AlarmNotifications {
  private const val CHANNEL = "reminder-alarms"
  const val RINGING_ID = 0x616c61
  private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  private fun manager(context: Context) = context.getSystemService(NotificationManager::class.java)

  private fun builder(context: Context): Notification.Builder {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      @Suppress("DEPRECATION")
      return Notification.Builder(context).setPriority(Notification.PRIORITY_MAX)
    }
    // Silent: the service plays the alarm itself, on the alarm volume.
    val channel = NotificationChannel(CHANNEL, "闹铃提醒", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "像闹钟一样响铃的提醒"
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager(context).createNotificationChannel(channel)
    return Notification.Builder(context, CHANNEL)
  }

  // The status bar icon and color that the expo-notifications plugin writes from app.json.
  private fun Notification.Builder.branded(context: Context): Notification.Builder {
    val resources = context.resources
    val icon = resources.getIdentifier("notification_icon", "drawable", context.packageName)
    setSmallIcon(if (icon != 0) icon else context.applicationInfo.icon)
    val color = resources.getIdentifier("notification_icon_color", "color", context.packageName)
    if (color != 0) setColor(context.getColor(color))
    return this
  }

  private fun action(label: String, intent: PendingIntent) = Notification.Action.Builder(null as Icon?, label, intent).build()

  /** Covers the lock screen with the alarm screen, or drops down over whatever is in use. */
  fun ringing(context: Context, alarm: Alarm): Notification {
    val screen = PendingIntent.getActivity(context, 0, Intent(context, AlarmActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), FLAGS)
    return builder(context)
      .branded(context)
      .setContentTitle(alarm.title)
      .setContentText(alarm.body)
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setContentIntent(screen)
      .setFullScreenIntent(screen, true)
      .addAction(action(AlarmService.SNOOZE_LABEL, AlarmService.command(context, AlarmService.ACTION_SNOOZE)))
      .addAction(action(AlarmService.DISMISS_LABEL, AlarmService.command(context, AlarmService.ACTION_DISMISS)))
      .build()
  }

  /** A reminder that stopped ringing unanswered stays in the shade, quietly; a tap opens it. */
  fun leave(context: Context, alarm: Alarm) {
    val id = alarm.id.hashCode()
    val notification = builder(context)
      .branded(context)
      .setContentTitle(alarm.title)
      .setContentText(alarm.body)
      .setWhen(alarm.fireAt)
      .setShowWhen(true)
      .setOnlyAlertOnce(true)
      .setAutoCancel(true)
      .setContentIntent(PendingIntent.getActivity(context, id, open(context, alarm.url), FLAGS))
      .build()
    manager(context).notify(id, notification)
  }

  fun cancelRinging(context: Context) {
    manager(context).cancel(RINGING_ID)
  }

  fun open(context: Context, url: String): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
