package app.muchakucha.reminderalarm

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings

/**
 * Rings one alarm at a time on the alarm volume, with vibration, until it is
 * dismissed, snoozed or has rung for five minutes. A second alarm due at the
 * same moment takes over; the first stays behind as a notification.
 */
class AlarmService : Service() {
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var focus: AudioFocusRequest? = null
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { ringing?.let { stop(it, unanswered = true) } }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val current = ringing
    when (intent?.action) {
      ACTION_RING -> Alarm.from(intent)?.let(::start)
      ACTION_DISMISS -> current?.let { stop(it, unanswered = false) }
      ACTION_SNOOZE -> current?.let(::snooze)
    }
    if (ringing == null) {
      // A button on a ringing notification outlived by its process.
      AlarmNotifications.cancelRinging(this)
      stopSelf()
    }
    return START_NOT_STICKY
  }

  // Stopped by the system while ringing: what rang stays behind as a reminder.
  override fun onDestroy() {
    quiet()
    ringing?.let { AlarmNotifications.leave(this, it) }
    AlarmNotifications.cancelRinging(this)
    ringing = null
    AlarmActivity.refresh()
    super.onDestroy()
  }

  private fun start(alarm: Alarm) {
    ringing?.let { AlarmNotifications.leave(this, it) }
    ringing = alarm
    val notification = AlarmNotifications.ringing(this, alarm)
    // Posted on its own first: HyperOS turns down startForeground for an app it
    // counts as idle without throwing, and the alarm keeps ringing with neither
    // its buttons nor its screen.
    AlarmNotifications.showRinging(this, notification)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(AlarmNotifications.RINGING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(AlarmNotifications.RINGING_ID, notification)
      }
    } catch (error: RuntimeException) {
      // Not allowed to ring from the background: the reminder at least stays.
      ringing = null
      AlarmNotifications.leave(this, alarm)
      return
    }
    if (player == null) play()
    if (vibrator == null) vibrate()
    handler.removeCallbacks(timeout)
    handler.postDelayed(timeout, RING_MILLIS)
    AlarmActivity.refresh()
  }

  private fun stop(alarm: Alarm, unanswered: Boolean) {
    if (unanswered) AlarmNotifications.leave(this, alarm)
    quiet()
    ringing = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    AlarmNotifications.cancelRinging(this)
    stopSelf()
    AlarmActivity.refresh()
  }

  private fun snooze(alarm: Alarm) {
    val store = AlarmStore.snoozed(this)
    val later = alarm.copy(fireAt = System.currentTimeMillis() + SNOOZE_MILLIS)
    store.put(later)
    AlarmScheduler.arm(this, later, store)
    stop(alarm, unanswered = false)
  }

  private fun play() {
    requestFocus()
    for (tone in tones()) {
      val next = MediaPlayer()
      try {
        next.setAudioAttributes(ALARM_AUDIO)
        next.setDataSource(this, tone)
        next.isLooping = true
        next.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK)
        next.prepare()
        next.start()
        player = next
        return
      } catch (error: Exception) {
        // A tone on storage this app cannot read; try the next one.
        next.release()
      }
    }
  }

  // The alarm tone the person chose in the clock app, then the system's.
  private fun tones(): List<Uri> = listOfNotNull(
    RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM),
    Settings.System.DEFAULT_ALARM_ALERT_URI,
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
  )

  private fun requestFocus() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(ALARM_AUDIO).build()
    getSystemService(AudioManager::class.java).requestAudioFocus(request)
    focus = request
  }

  private fun vibrate() {
    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      getSystemService(VibratorManager::class.java).defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }
    if (!device.hasVibrator()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      @Suppress("DEPRECATION")
      device.vibrate(VibrationEffect.createWaveform(VIBRATION, 0), ALARM_AUDIO)
    } else {
      @Suppress("DEPRECATION")
      device.vibrate(VIBRATION, 0)
    }
    vibrator = device
  }

  private fun quiet() {
    handler.removeCallbacks(timeout)
    player?.run { runCatching { stop() }; release() }
    player = null
    vibrator?.cancel()
    vibrator = null
    focus?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
    focus = null
  }

  companion object {
    private const val ACTION_RING = "app.muchakucha.reminderalarm.RING"
    const val ACTION_DISMISS = "app.muchakucha.reminderalarm.DISMISS"
    const val ACTION_SNOOZE = "app.muchakucha.reminderalarm.SNOOZE"
    const val DISMISS_LABEL = "知道了"
    const val SNOOZE_LABEL = "10 分钟后再响"
    private const val RING_MILLIS = 5 * 60_000L
    private const val SNOOZE_MILLIS = 10 * 60_000L
    private val VIBRATION = longArrayOf(0, 800, 800)
    private val ALARM_AUDIO: AudioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

    /** The alarm ringing now, for the alarm screen. Changed on the main thread only. */
    @Volatile
    var ringing: Alarm? = null
      private set

    fun ring(context: Context, alarm: Alarm) {
      val intent = alarm.putInto(Intent(context, AlarmService::class.java).setAction(ACTION_RING))
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
      } catch (error: RuntimeException) {
        // Background starts are refused without an exact alarm; leave the reminder instead.
        AlarmNotifications.leave(context, alarm)
      }
    }

    fun command(context: Context, action: String): PendingIntent =
      PendingIntent.getService(context, action.hashCode(), Intent(context, AlarmService::class.java).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    /** For the alarm screen's buttons and for signing out; does nothing when nothing rings. */
    fun send(context: Context, action: String) {
      if (ringing != null) context.startService(Intent(context, AlarmService::class.java).setAction(action))
    }
  }
}
