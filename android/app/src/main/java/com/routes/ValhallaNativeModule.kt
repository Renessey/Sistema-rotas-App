package com.routes

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments

/**
 * ValhallaNativeModule — Native Android Bridge (Phase 5).
 *
 * React Native -> ValhallaService -> ValhallaNativeModule -> Valhalla (C++)
 *
 * This is the integration point for the embedded Valhalla engine. The Valhalla
 * C++ library is compiled separately (see ValhallaData/README) and linked here.
 * Until the engine is linked, every method reports NOT_AVAILABLE so the JS layer
 * can transparently fall back to its offline approximate implementation.
 */
class ValhallaNativeModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ValhallaModule"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(isEngineLinked)
  }

  @ReactMethod
  fun tilesReady(promise: Promise) {
    val map: WritableMap = Arguments.createMap()
    map.putBoolean("installed", isEngineLinked && tilesInstalled())
    map.putString("region", "marica-niteroi-sao-goncalo")
    map.putString("version", "0.1.0")
    promise.resolve(map)
  }

  @ReactMethod
  fun route(waypointsJson: String, optionsJson: String, promise: Promise) {
    if (!isEngineLinked) {
      promise.reject("NOT_AVAILABLE", "Valhalla engine not linked yet")
      return
    }
    promise.reject("NOT_AVAILABLE", "Valhalla engine not linked yet")
  }

  @ReactMethod
  fun matrix(originsJson: String, destinationsJson: String, promise: Promise) {
    if (!isEngineLinked) {
      promise.reject("NOT_AVAILABLE", "Valhalla engine not linked yet")
      return
    }
    promise.reject("NOT_AVAILABLE", "Valhalla engine not linked yet")
  }

  @ReactMethod
  fun locate(lat: Double, lon: Double, radius: Double, bearing: Double?, promise: Promise) {
    if (!isEngineLinked) {
      promise.reject("NOT_AVAILABLE", "Valhalla engine not linked yet")
      return
    }
    promise.reject("NOT_AVAILABLE", "Valhalla engine not linked yet")
  }

  @ReactMethod
  fun optimizedRoute(waypointsJson: String, optionsJson: String, promise: Promise) {
    if (!isEngineLinked) {
      promise.reject("NOT_AVAILABLE", "Valhalla engine not linked yet")
      return
    }
    promise.reject("NOT_AVAILABLE", "Valhalla engine not linked yet")
  }

  /**
   * Whether the embedded Valhalla C++ library is compiled and linked.
   * Flip this to true after linking libvalhalla (see ValhallaData/README).
   */
  private val isEngineLinked: Boolean
    get() = false

  /** Whether the region tiles are installed in app storage */
  private fun tilesInstalled(): Boolean {
    val dir = reactApplicationContext.getExternalFilesDir(null)
        ?: reactApplicationContext.filesDir
    return java.io.File(dir, "valhalla/tiles/000/000/000.gph").exists()
  }
}
