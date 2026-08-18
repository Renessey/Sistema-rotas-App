package com.routes

import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "Routes"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enterImmersiveMode()
  }

  /**
   * Quando a janela ganha foco (volta do background, dismiss de dialog, etc.)
   * reaplica o modo imersivo para que as barras não fiquem visíveis.
   */
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) enterImmersiveMode()
  }

  /**
   * Modo imersivo "sticky": esconde status bar E navigation bar.
   * Ao arrastar da borda, as barras aparecem temporariamente e somem
   * sozinhas após alguns segundos — comportamento ideal para apps de entrega.
   *
   * Suporte: Android 6+ (API 23+) com fallback para API 11+.
   */
  private fun enterImmersiveMode() {
    window.statusBarColor = android.graphics.Color.TRANSPARENT
    window.navigationBarColor = android.graphics.Color.TRANSPARENT

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      // Android 11+ — WindowInsetsController moderno
      window.setDecorFitsSystemWindows(false)
      window.insetsController?.let { ctrl ->
        ctrl.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
        ctrl.systemBarsBehavior =
          WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      }
    } else {
      // Android 6–10 — flags legadas (sticky immersive)
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = (
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
          or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
          or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
          or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
          or View.SYSTEM_UI_FLAG_FULLSCREEN
          or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
      )
    }
  }
}
