package app.muchakucha.reminderalarm

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reminders that ring like an alarm clock. The app schedules and cancels them
 * by id, as it does notifications; everything after that — ringing, the alarm
 * screen, snoozing, surviving a reboot — happens here without JavaScript.
 */
class ReminderAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun canUseFullScreen(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()

  override fun definition() = ModuleDefinition {
    Name("ReminderAlarm")

    AsyncFunction("schedule") { id: String, fireAt: Double, title: String, body: String, url: String ->
      val store = AlarmStore.scheduled(context)
      val alarm = Alarm(id, fireAt.toLong(), title, body, url)
      store.put(alarm)
      AlarmScheduler.arm(context, alarm, store)
    }

    AsyncFunction("cancel") { id: String ->
      val store = AlarmStore.scheduled(context)
      store.remove(id)
      AlarmScheduler.disarm(context, id, store)
    }

    // Signing out: nothing scheduled, snoozed or ringing is left on the phone.
    AsyncFunction("cancelAll") {
      for (store in AlarmStore.both(context)) {
        for (alarm in store.all()) AlarmScheduler.disarm(context, alarm.id, store)
        store.clear()
      }
      AlarmService.send(context, AlarmService.ACTION_DISMISS)
    }

    // Registers them again as well: a force stop clears the system's alarms but not this list.
    AsyncFunction("scheduledIds") {
      AlarmScheduler.rearmAll(context)
      AlarmStore.scheduled(context).all().map { alarm -> alarm.id }
    }

    // Android 14 lets the person withhold covering the lock screen; earlier versions grant it.
    Function("canUseFullScreen") {
      canUseFullScreen()
    }

    // Where the person lets an alarm cover the lock screen: Android 14's own page, else the app's
    // details, where Chinese systems keep 锁屏显示 and 后台弹出界面.
    AsyncFunction("openAlarmSettings") {
      val packageUri = Uri.parse("package:${context.packageName}")
      val action = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && !canUseFullScreen()) {
        Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT
      } else {
        Settings.ACTION_APPLICATION_DETAILS_SETTINGS
      }
      val activity = appContext.currentActivity
      val intent = Intent(action, packageUri)
      if (activity != null) activity.startActivity(intent) else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
