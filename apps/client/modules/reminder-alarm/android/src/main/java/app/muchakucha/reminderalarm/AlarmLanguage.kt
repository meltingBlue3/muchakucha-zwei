package app.muchakucha.reminderalarm

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

/** The alarm can ring in a cold process, before Expo restores the interface language. */
internal object AlarmLanguage {
  private fun preferences(context: Context) = context.getSharedPreferences("reminder_alarm_language", Context.MODE_PRIVATE)

  fun set(context: Context, language: String) {
    if (preferences(context).getString("tag", null) == language) return
    preferences(context).edit().putString("tag", language).apply()
    AlarmNotifications.refreshChannel(context)
  }

  fun localizedContext(context: Context): Context {
    val tag = preferences(context).getString("tag", null) ?: return context
    val config = Configuration(context.resources.configuration).apply { setLocale(Locale.forLanguageTag(tag)) }
    return context.createConfigurationContext(config)
  }
}
