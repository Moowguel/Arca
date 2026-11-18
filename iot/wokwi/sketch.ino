// =====================================================================
// ARCA — estação de monitoramento do córrego (ESP32 no Wokwi)
//
// Sensores:
//   HC-SR04 (ultrassônico) preso na ponte, olhando para baixo → nível do córrego (cm)
//   Potenciômetro no lugar do pluviômetro                     → chuva (mm/h)
// Saídas:
//   LED amarelo = atenção · LED vermelho = crítico (mesmos limites do banco)
//
// A cada 5 s monta o JSON aceito por POST /api/sensores e mostra no monitor serial.
// Se ARCA_URL estiver preenchida com um endereço público, também envia de verdade.
// =====================================================================
#include <WiFi.h>
#include <HTTPClient.h>

// ---------- configuração ----------
const char* WIFI_SSID  = "Wokwi-GUEST";   // rede com internet do simulador
const char* WIFI_SENHA = "";
const char* ARCA_URL   = "";              // ex.: "https://seu-app.exemplo.com/api/sensores" (vazio = só serial)
const char* CHAVE      = "";              // mesma CHAVE_DISPOSITIVO do .env.local
const char* SENSOR_NIVEL = "NIV-01";      // Jardim Pantanal
const char* SENSOR_CHUVA = "CHU-01";

// calibração: altura do sensor em relação ao fundo do córrego.
// Ajuste no local de instalação — nível = altura - distância medida.
const float ALTURA_SENSOR_CM = 400.0;
const float CHUVA_MAX_MM_H   = 60.0;      // potenciômetro no máximo

// limites (iguais aos cadastrados na tabela sensores)
const float NIVEL_ATENCAO = 150, NIVEL_CRITICO = 220;
const float CHUVA_ATENCAO = 15,  CHUVA_CRITICO = 30;

// ---------- pinos ----------
const int PINO_TRIG = 5;
const int PINO_ECHO = 18;
const int PINO_POT  = 34;
const int PINO_LED_AMARELO  = 4;
const int PINO_LED_VERMELHO = 2;

const unsigned long INTERVALO_MS = 5000;

float medirDistanciaCm() {
  digitalWrite(PINO_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PINO_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PINO_TRIG, LOW);
  unsigned long duracao = pulseIn(PINO_ECHO, HIGH, 30000);  // até ~5 m
  if (duracao == 0) return -1;                              // sem eco
  return duracao / 58.0;                                    // µs → cm
}

const char* classificar(float valor, float atencao, float critico) {
  if (valor >= critico) return "critico";
  if (valor >= atencao) return "atencao";
  return "normal";
}

void conectarWifi() {
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  Serial.print("Conectando ao Wi-Fi");
  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) {
    delay(250);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? " ok" : " sem rede (segue só no serial)");
}

void setup() {
  Serial.begin(115200);
  pinMode(PINO_TRIG, OUTPUT);
  pinMode(PINO_ECHO, INPUT);
  pinMode(PINO_LED_AMARELO, OUTPUT);
  pinMode(PINO_LED_VERMELHO, OUTPUT);
  Serial.println("ARCA — estação do córrego iniciada");
  if (strlen(ARCA_URL) > 0) conectarWifi();
}

void loop() {
  float distancia = medirDistanciaCm();
  if (distancia < 0) {
    Serial.println("HC-SR04 sem eco: leitura descartada");
    delay(INTERVALO_MS);
    return;
  }
  float nivel = constrain(ALTURA_SENSOR_CM - distancia, 0, 500);
  float chuva = analogRead(PINO_POT) * CHUVA_MAX_MM_H / 4095.0;

  const char* riscoNivel = classificar(nivel, NIVEL_ATENCAO, NIVEL_CRITICO);
  const char* riscoChuva = classificar(chuva, CHUVA_ATENCAO, CHUVA_CRITICO);
  bool critico = !strcmp(riscoNivel, "critico") || !strcmp(riscoChuva, "critico");
  bool atencao = !critico && (!strcmp(riscoNivel, "atencao") || !strcmp(riscoChuva, "atencao"));
  digitalWrite(PINO_LED_VERMELHO, critico);
  digitalWrite(PINO_LED_AMARELO, atencao);

  char json[160];
  snprintf(json, sizeof(json),
           "[{\"sensor_id\":\"%s\",\"valor\":%.1f},{\"sensor_id\":\"%s\",\"valor\":%.1f}]",
           SENSOR_NIVEL, nivel, SENSOR_CHUVA, chuva);

  Serial.printf("nível %.1f cm (%s) | chuva %.1f mm/h (%s)\n", nivel, riscoNivel, chuva, riscoChuva);
  Serial.printf("payload: %s\n", json);

  if (strlen(ARCA_URL) > 0 && WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(ARCA_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-chave-dispositivo", CHAVE);
    http.addHeader("x-origem", "wokwi");
    int status = http.POST(json);
    Serial.printf("enviado → HTTP %d\n", status);
    http.end();
  }

  delay(INTERVALO_MS);
}
