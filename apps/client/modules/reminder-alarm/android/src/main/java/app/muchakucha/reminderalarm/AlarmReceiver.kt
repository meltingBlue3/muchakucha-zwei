package app.muchakucha.reminderalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The system's alarm went off: hand the alarm to the service that rings it. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val (store, id) = AlarmScheduler.target(context, intent) ?: return
    // Cancelled since, or already rung.
    val alarm = store.get(id) ?: return
    store.remove(id)
    AlarmService.ring(context, alarm)
  }
}

/** A reboot or an app update clears the system's alarms; register the stored ones again. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      AlarmScheduler.rearmAll(context)
    }
  }
}
