import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️ IMPORTANTE: Cambia esta IP por la de tu PC
const WEBHOOK_URL = 'http://10.100.1.203:5678/webhook-test/location-tracker';

export default function App() {
  const [isTracking, setIsTracking] = useState(false);
  const [lastLocation, setLastLocation] = useState(null);
  const [locationCount, setLocationCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState('⚪ Desconectado');
  const [batteryLevel, setBatteryLevel] = useState(0);
  const watchSubscription = useRef(null);

  useEffect(() => {
    checkPermissions();
    getBatteryLevel();
  }, []);

  const getBatteryLevel = async () => {
    try {
      const level = await Battery.getBatteryLevelAsync();
      setBatteryLevel(Math.round(level * 100));
    } catch (error) {
      console.log('Error obteniendo batería:', error);
    }
  };

  const checkPermissions = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasPermission(status === 'granted');
      console.log('Permiso de ubicación:', status);
    } catch (error) {
      console.log('Error en permisos:', error);
    }
  };

  const startTracking = async () => {
    try {
      setIsLoading(true);
      console.log('Iniciando rastreo...');

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Permiso de ubicación denegado');
        setIsLoading(false);
        return;
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        async (location) => {
          console.log('📍 Nueva ubicación detectada:', location.coords.latitude, location.coords.longitude);
          const telemetryData = await buildTelemetryPayload(location);
          setLastLocation(telemetryData);
          setLocationCount(prev => prev + 1);
          await sendToWebhook(telemetryData);
        }
      );

      watchSubscription.current = subscription;
      setIsTracking(true);
      setWebhookStatus('🟢 Activo');
      Alert.alert('✅ Éxito', 'Rastreo GPS activado');
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('❌ Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const stopTracking = async () => {
    if (watchSubscription.current) {
      watchSubscription.current.remove();
      watchSubscription.current = null;
    }
    setIsTracking(false);
    setWebhookStatus('⚪ Desconectado');
    Alert.alert('⏹️ Detenido', 'Rastreo GPS desactivado');
  };

  const buildTelemetryPayload = async (location) => {
    const { coords, timestamp } = location;
    
    return {
      usuario: "Andrik Guzmán",
      ubicacion: {
        lat: coords.latitude,
        lon: coords.longitude,
        altitud: coords.altitude || 0,
        precision: coords.accuracy || 0,
      },
      movimiento: {
        velocidad: coords.speed || 0,
        velocidad_kmh: (coords.speed || 0) * 3.6,
        marca_tiempo: new Date(timestamp).toISOString(),
      },
      dispositivo: {
        nombre: Device.modelName || 'Móvil',
        version: Device.osVersion || 'Desconocida',
        plataforma: Platform.OS,
      },
      estado: {
        bateria: batteryLevel,
        timestamp_recepcion: new Date().toISOString(),
      }
    };
  };

  const sendToWebhook = async (data) => {
    try {
      console.log('📤 Enviando datos a n8n...', data);
      
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(data),
      });

      // Leer la respuesta como texto primero
      const responseText = await response.text();
      console.log('📥 Respuesta (texto):', responseText);

      // Intentar parsear como JSON solo si es posible
      try {
        const jsonResponse = JSON.parse(responseText);
        console.log('✅ Respuesta JSON:', jsonResponse);
      } catch {
        console.log('✅ Respuesta recibida (texto plano):', responseText);
      }
    } catch (error) {
      console.error('❌ Error enviando a n8n:', error);
    }
  };

  const testWebhook = async () => {
    const testData = {
      usuario: "Andrik Guzmán (TEST)",
      ubicacion: {
        lat: 19.4326077,
        lon: -99.133208,
        altitud: 2240.5,
        precision: 4.2,
      },
      movimiento: {
        velocidad: 0,
        velocidad_kmh: 0,
        marca_tiempo: new Date().toISOString(),
      },
      dispositivo: {
        nombre: "Test",
        version: "1.0",
        plataforma: "Android",
      },
      estado: {
        bateria: batteryLevel,
        timestamp_recepcion: new Date().toISOString(),
      }
    };

    await sendToWebhook(testData);
    Alert.alert('✅ Test', 'Datos enviados a n8n');
  };

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.icon}>📍</Text>
          <Text style={styles.title}>Permiso Requerido</Text>
          <Text style={styles.subtitle}>La app necesita acceso al GPS</Text>
          <TouchableOpacity style={styles.button} onPress={checkPermissions}>
            <Text style={styles.buttonText}>OTORGAR PERMISO</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📱 Rastreador GPS</Text>
          <Text style={styles.headerSub}>Intervalo: 10 metros</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Estado</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Rastreo:</Text>
            <Text style={[styles.value, isTracking ? styles.active : styles.inactive]}>
              {isTracking ? '🟢 Activo' : '⭕ Detenido'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Webhook:</Text>
            <Text style={styles.value}>{webhookStatus}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Puntos:</Text>
            <Text style={styles.value}>{locationCount}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Batería:</Text>
            <Text style={styles.value}>🔋 {batteryLevel}%</Text>
          </View>
        </View>

        {lastLocation && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📍 Última Ubicación</Text>
            <Text style={styles.text}>Lat: {lastLocation.ubicacion.lat.toFixed(6)}</Text>
            <Text style={styles.text}>Lon: {lastLocation.ubicacion.lon.toFixed(6)}</Text>
            <Text style={styles.text}>Alt: {lastLocation.ubicacion.altitud.toFixed(1)}m</Text>
            <Text style={styles.text}>Vel: {lastLocation.movimiento.velocidad_kmh.toFixed(1)} km/h</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, isTracking ? styles.buttonDanger : styles.buttonSuccess]}
          onPress={isTracking ? stopTracking : startTracking}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'CARGANDO...' : isTracking ? '⏹️ DETENER' : '▶️ INICIAR'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.buttonInfo]} onPress={testWebhook}>
          <Text style={styles.buttonText}>🧪 TEST WEBHOOK</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scroll: {
    flex: 1,
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  headerSub: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  value: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '500',
  },
  active: {
    color: '#2ecc71',
  },
  inactive: {
    color: '#e74c3c',
  },
  text: {
    fontSize: 14,
    color: '#34495e',
    paddingVertical: 2,
  },
  icon: {
    fontSize: 64,
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    marginBottom: 30,
    textAlign: 'center',
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonSuccess: {
    backgroundColor: '#2ecc71',
  },
  buttonDanger: {
    backgroundColor: '#e74c3c',
  },
  buttonInfo: {
    backgroundColor: '#3498db',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});