package com.routes

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class CompassModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), SensorEventListener {

    private val TAG = "CompassModule"
    private var sensorManager: SensorManager? = null
    private var rotationSensor: Sensor? = null
    private val rotationMatrix = FloatArray(9)
    private val orientationAngles = FloatArray(3)
    private var lastHeading: Double = 0.0
    private var isRunning = false

    override fun getName(): String = "CompassModule"

    init {
        sensorManager = reactContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        // Apenas sensores reais de rotação geomagnética do hardware
        rotationSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
            ?: sensorManager?.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)

        Log.d(TAG, "Init: rotationSensor=${rotationSensor?.name}")
    }

    @ReactMethod
    fun start() {
        if (isRunning) return
        isRunning = true
        Log.d(TAG, "Starting compass listener...")

        if (rotationSensor != null) {
            sensorManager?.registerListener(this, rotationSensor, SensorManager.SENSOR_DELAY_UI)
        } else {
            // Em dispositivos sem bússola magnética de hardware (ex: Moto G06),
            // NÃO ativamos ouvintes de inclinação de gravidade (tilt),
            // pois inclinação não é azimute magnético e faz o mapa girar sozinho na mão do usuário.
            // O app usará o rumo GPS (Course over Ground) de alta precisão ao se movimentar.
            Log.d(TAG, "Nenhum sensor de rotação magnética disponível no hardware.")
        }
    }

    @ReactMethod
    fun stop() {
        if (!isRunning) return
        isRunning = false
        if (rotationSensor != null) {
            sensorManager?.unregisterListener(this)
        }
    }

    // Required by React Native NativeEventEmitter
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun onSensorChanged(event: SensorEvent?) {
        event ?: return
        var headingDeg = 0.0

        if (event.sensor.type == Sensor.TYPE_ROTATION_VECTOR ||
            event.sensor.type == Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR) {
            SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
            SensorManager.getOrientation(rotationMatrix, orientationAngles)
            var azimuth = Math.toDegrees(orientationAngles[0].toDouble())
            if (azimuth < 0) {
                azimuth += 360.0
            }
            headingDeg = azimuth
            emitHeading(headingDeg)
        }
    }

    private fun emitHeading(headingDeg: Double) {
        // Limiar seguro de 2.5 graus: elimina ruídos e evita oscilações espúrias
        val diff = Math.abs(((headingDeg - lastHeading + 540) % 360) - 180)
        if (diff >= 2.5) {
            lastHeading = headingDeg
            val params = Arguments.createMap().apply {
                putDouble("heading", headingDeg)
            }
            if (reactContext.hasActiveReactInstance()) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit("CompassUpdate", params)
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
