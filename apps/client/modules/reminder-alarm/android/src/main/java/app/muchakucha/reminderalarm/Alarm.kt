package app.muchakucha.reminderalarm

import android.content.Context
import android.content.Intent
import org.json.JSONObject

/** One reminder that rings: what the alarm screen says, and the deep link its 查看 opens. */
data class Alarm(val id: String, val fireAt: Long, val title: String, val body: String, val url: String) {
  fun toJson(): String = JSONObject()
    .put("id", id)
    .put("fireAt", fireAt)
    .put("title", title)
    .put("body", body)
    .put("url", url)
    .toString()

  fun putInto(intent: Intent): Intent = intent.putExtra(EXTRA, toJson())

  companion object {
    private const val EXTRA = "app.muchakucha.reminderalarm.ALARM"

    fun fromJson(json: String): Alarm? = runCatching {
      val value = JSONObject(json)
      Alarm(value.getString("id"), value.getLong("fireAt"), value.getString("title"), value.getString("body"), value.getString("url"))
    }.getOrNull()

    fun from(intent: Intent): Alarm? = intent.getStringExtra(EXTRA)?.let(::fromJson)
  }
}

/**
 * Alarms still to come, kept on disk: the system forgets its alarms on a
 * reboot or a force stop, and the app reads this list to learn what the phone
 * holds.
 */
class AlarmStore private constructor(context: Context, name: String, val snoozed: Boolean) {
  private val preferences = context.getSharedPreferences("reminder_alarms_$name", Context.MODE_PRIVATE)

  fun all(): List<Alarm> = preferences.all.values.mapNotNull { value -> (value as? String)?.let(Alarm::fromJson) }

  fun get(id: String): Alarm? = preferences.getString(id, null)?.let(Alarm::fromJson)

  fun put(alarm: Alarm) {
    preferences.edit().putString(alarm.id, alarm.toJson()).apply()
  }

  fun remove(id: String) {
    preferences.edit().remove(id).apply()
  }

  fun clear() {
    preferences.edit().clear().apply()
  }

  companion object {
    /** What the app scheduled from the server's list; it reconciles these. */
    fun scheduled(context: Context) = AlarmStore(context, "scheduled", snoozed = false)

    /** 稍后再响 belongs to the phone alone, so the app's reconciling leaves it be. */
    fun snoozed(context: Context) = AlarmStore(context, "snoozed", snoozed = true)

    fun both(context: Context) = listOf(scheduled(context), snoozed(context))
  }
}
