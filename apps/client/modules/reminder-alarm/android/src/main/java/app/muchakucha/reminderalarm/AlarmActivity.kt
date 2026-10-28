package app.muchakucha.reminderalarm

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Bundle
import android.text.format.DateFormat
import android.view.Gravity
import android.view.View
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Date

/**
 * The alarm screen: shown over the lock screen while an alarm rings, closed
 * when it stops. Large type and two large buttons, for someone who picks the
 * phone up only because it rang.
 */
class AlarmActivity : Activity() {
  private var opening = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    // Before Android 15's edge-to-edge, the status bar has its own color.
    @Suppress("DEPRECATION")
    window.statusBarColor = CANVAS
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      // Through the decor view, which this creates: MIUI's window.insetsController
      // reads it without creating it and throws before setContentView.
      window.decorView.windowInsetsController?.setSystemBarsAppearance(WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS)
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
    }
    shown = this
    render()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    render()
  }

  override fun onDestroy() {
    if (shown === this) shown = null
    super.onDestroy()
  }

  private fun render() {
    val alarm = AlarmService.ringing
    if (alarm == null) {
      if (!opening) finish()
      return
    }
    setContentView(layout(alarm))
  }

  private fun open(alarm: Alarm) {
    opening = true
    AlarmService.send(this, AlarmService.ACTION_DISMISS)
    val start = {
      startActivity(AlarmNotifications.open(this, alarm.url))
      finish()
    }
    val keyguard = getSystemService(KeyguardManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && keyguard.isKeyguardLocked) {
      keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() = start()
        override fun onDismissCancelled() = finish()
        override fun onDismissError() = finish()
      })
    } else {
      start()
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun text(value: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
    text = value
    textSize = size
    setTextColor(color)
    gravity = Gravity.CENTER
    if (bold) typeface = Typeface.DEFAULT_BOLD
  }

  private fun button(label: String, filled: Boolean, onPress: () -> Unit) = Button(this).apply {
    text = label
    textSize = 20f
    isAllCaps = false
    stateListAnimator = null
    setTextColor(if (filled) SURFACE else INK)
    minHeight = dp(64)
    val shape = GradientDrawable().apply {
      cornerRadius = dp(32).toFloat()
      setColor(if (filled) INK else SURFACE)
      if (!filled) setStroke(dp(1), OUTLINE)
    }
    background = RippleDrawable(ColorStateList.valueOf(if (filled) INK_PRESSED else SURFACE_MUTED), shape, null)
    setOnClickListener { onPress() }
  }

  private fun layout(alarm: Alarm): View {
    val full = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(24), dp(48), dp(24), dp(24))
      addView(text(DateFormat.getTimeFormat(this@AlarmActivity).format(Date(alarm.fireAt)), 56f, INK))
      addView(text(alarm.title, 30f, INK, bold = true).apply { setPadding(0, dp(24), 0, 0) }, full)
      if (alarm.body.isNotEmpty()) addView(text(alarm.body, 18f, INK_MUTED).apply { setPadding(0, dp(12), 0, 0) }, full)
      addView(View(this@AlarmActivity), LinearLayout.LayoutParams(0, 0, 1f))
      addView(button(AlarmService.DISMISS_LABEL, filled = true) { AlarmService.send(this@AlarmActivity, AlarmService.ACTION_DISMISS) }, full)
      addView(
        button(AlarmService.SNOOZE_LABEL, filled = false) { AlarmService.send(this@AlarmActivity, AlarmService.ACTION_SNOOZE) },
        LinearLayout.LayoutParams(full).apply { topMargin = dp(12) },
      )
      addView(
        button("查看详情", filled = false) { open(alarm) }.apply { background = null; paintFlags = paintFlags or Paint.UNDERLINE_TEXT_FLAG },
        LinearLayout.LayoutParams(full).apply { topMargin = dp(8) },
      )
    }
    // Keeps the content clear of the status and navigation bars, which draw over the window.
    return FrameLayout(this).apply {
      setBackgroundColor(CANVAS)
      fitsSystemWindows = true
      addView(content, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    }
  }

  companion object {
    // From apps/client/src/ui/theme.ts: canvas, surface, surfaceMuted, ink, inkMuted, outline, primaryPressed.
    private val CANVAS = Color.parseColor("#F6F4EF")
    private val SURFACE = Color.parseColor("#FFFFFF")
    private val SURFACE_MUTED = Color.parseColor("#EFECE6")
    private val INK = Color.parseColor("#1D1B18")
    private val INK_MUTED = Color.parseColor("#5F5A52")
    private val OUTLINE = Color.parseColor("#D8D3CA")
    private val INK_PRESSED = Color.parseColor("#3A3631")

    private var shown: AlarmActivity? = null

    /** The ringing alarm changed or stopped: show the new one, or close. */
    fun refresh() {
      shown?.render()
    }
  }
}
