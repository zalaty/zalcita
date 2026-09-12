import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { theme } from '@/theme';
import { appointmentStatusColors } from '@/theme';
import { Badge, Button, Card, Input, type BadgeTone } from '@/components/ui';
import { STATUS_LABELS } from '@/lib/appointments';
import type { AppointmentStatus } from '@/types/database';

// Guía de estilo viva del sistema de diseño — ruta suelta sin enlazar
// desde ningún menú (app/theme-preview.tsx, fuera de los grupos
// (auth)/(client)/(business)), pensada para quedarse permanentemente como
// referencia de desarrollo. Ver /theme-preview con `npx expo start --web`.
// No consume ningún dato real ni requiere sesión.

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: theme.spacing.md, marginBottom: theme.spacing.xxl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>{title}</Text>
        {description && (
          <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>{description}</Text>
        )}
      </View>
      {children}
    </View>
  );
}

function Swatch({ label, hex, contrast }: { label: string; hex: string; contrast?: string }) {
  return (
    <View style={{ width: 148, gap: theme.spacing.xs }}>
      <View
        style={{
          height: 56,
          borderRadius: theme.radii.md,
          backgroundColor: hex,
          borderWidth: hex === '#ffffff' || hex === theme.colors.background ? 1 : 0,
          borderColor: theme.colors.border,
        }}
      />
      <Text style={{ ...theme.textStyles.small, fontWeight: theme.fontWeights.semibold, color: theme.colors.textPrimary }}>
        {label}
      </Text>
      <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted }}>{hex}</Text>
      {contrast && <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted }}>{contrast}</Text>}
    </View>
  );
}

function SwatchRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>{children}</View>;
}

type CvdType = 'protanopia' | 'deuteranopia';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Simulación aproximada de daltonismo dicromático total — método LMS de
// Brettel/Viénot/Mollon, la técnica que reutilizan herramientas de
// simulación de daltonismo habituales (p.ej. daltonize.js). No es un
// simulador clínico, es una aproximación reproducible para comprobar
// separación de color en diseño — ver theme/colors.ts para el ajuste que
// motivó esta sección.
function simulateCvd(hex: string, type: CvdType): string {
  const [r, g, b] = hexToRgb(hex);
  const L = 17.8824 * r + 43.5161 * g + 4.11935 * b;
  const M = 3.45565 * r + 27.1554 * g + 3.86714 * b;
  const S = 0.0299566 * r + 0.184309 * g + 1.46709 * b;

  let L2 = L;
  let M2 = M;
  if (type === 'protanopia') {
    L2 = 2.02344 * M - 2.52581 * S;
  } else {
    M2 = 0.494207 * L + 1.24827 * S;
  }

  return rgbToHex([
    0.0809444479 * L2 - 0.130504409 * M2 + 0.116721066 * S,
    -0.0102485335 * L2 + 0.0540193266 * M2 - 0.113614708 * S,
    -0.000365296938 * L2 - 0.00412161469 * M2 + 0.693511405 * S,
  ]);
}

function CvdComparisonRow({ label, hex }: { label: string; hex: string }) {
  const chips: { chip: string; swatchHex: string }[] = [
    { chip: 'real', swatchHex: hex },
    { chip: 'protanopía', swatchHex: simulateCvd(hex, 'protanopia') },
    { chip: 'deuteranopía', swatchHex: simulateCvd(hex, 'deuteranopia') },
  ];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, flexWrap: 'wrap' }}>
      <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary, width: 190 }}>{label}</Text>
      {chips.map(({ chip, swatchHex }) => (
        <View key={chip} style={{ alignItems: 'center', gap: 2 }}>
          <View style={{ width: 72, height: 36, borderRadius: theme.radii.sm, backgroundColor: swatchHex }} />
          <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted }}>{chip}</Text>
        </View>
      ))}
    </View>
  );
}

const APPOINTMENT_STATUSES: { status: AppointmentStatus; tone: BadgeTone }[] = [
  { status: 'pending', tone: 'warning' },
  { status: 'confirmed', tone: 'success' },
  { status: 'completed', tone: 'info' },
  { status: 'cancelled', tone: 'neutral' },
  { status: 'no_show', tone: 'danger' },
];

export default function ThemePreview() {
  const [inputValue, setInputValue] = useState('');
  const [loadingDemo, setLoadingDemo] = useState(false);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.xl }}>
      <View style={{ marginBottom: theme.spacing.xxl, gap: theme.spacing.xs }}>
        <Text style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}>Sistema de diseño — Zalcita</Text>
        <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
          Guía de estilo viva. Todo lo de aquí consume theme/ y components/ui/ — nada de hex ni tamaños sueltos.
        </Text>
      </View>

      <Section
        title="Marca"
        description="`primary` lleva texto encima (5.48:1). `primaryVivid` es solo para acentos sin texto — iconos, indicador de pestaña activa."
      >
        <SwatchRow>
          <Swatch label="primary" hex={theme.colors.primary} contrast="5.48:1 vs blanco" />
          <Swatch label="primaryHover" hex={theme.colors.primaryHover} />
          <Swatch label="primaryPressed" hex={theme.colors.primaryPressed} />
          <Swatch label="primaryVivid" hex={theme.colors.primaryVivid} contrast="solo acentos, sin texto" />
          <Swatch label="primarySurface" hex={theme.colors.primarySurface} />
          <Swatch label="primaryDisabled" hex={theme.colors.primaryDisabled} />
        </SwatchRow>
      </Section>

      <Section title="Neutros / superficies" description="Cálidos, no gris frío — para la sensación 'cercana' de la dirección visual.">
        <SwatchRow>
          <Swatch label="background" hex={theme.colors.background} />
          <Swatch label="surface" hex={theme.colors.surface} />
          <Swatch label="border" hex={theme.colors.border} />
          <Swatch label="borderStrong" hex={theme.colors.borderStrong} contrast="4.79:1 (input)" />
          <Swatch label="textPrimary" hex={theme.colors.textPrimary} />
          <Swatch label="textSecondary" hex={theme.colors.textSecondary} contrast="7.63:1" />
          <Swatch label="textMuted" hex={theme.colors.textMuted} contrast="4.79:1" />
        </SwatchRow>
      </Section>

      <Section
        title="Estado genérico"
        description="Reutilizables en cualquier pantalla (validación, avisos). Ninguno coincide con el teal de marca, a propósito."
      >
        <SwatchRow>
          <Swatch label="success" hex={theme.colors.success} contrast="7.13:1" />
          <Swatch label="warning" hex={theme.colors.warning} contrast="4.92:1" />
          <Swatch label="danger" hex={theme.colors.danger} contrast="6.47:1" />
          <Swatch label="info" hex={theme.colors.info} contrast="6.70:1" />
        </SwatchRow>
      </Section>

      <Section
        title="Estados de cita"
        description="Mismo reparto de matices que ya existía (ámbar/verde/azul/gris/rojo). Siempre con su etiqueta — nunca solo color, ver Badge más abajo."
      >
        <SwatchRow>
          {(Object.keys(appointmentStatusColors) as AppointmentStatus[]).map((status) => (
            <Swatch key={status} label={STATUS_LABELS[status]} hex={appointmentStatusColors[status]} />
          ))}
        </SwatchRow>
      </Section>

      <Section
        title="Simulación de daltonismo"
        description="Aproximación LMS (Brettel/Viénot/Mollon) de warning/success/danger bajo déficit rojo-verde total. `danger` no cambió: oscurecerlo empeoraba su separación de `success` bajo esta simulación (comprobado con un barrido de candidatos, no a ojo)."
      >
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted }}>ANTES DEL AJUSTE</Text>
          <CvdComparisonRow label="warning — #b45309" hex="#b45309" />
          <CvdComparisonRow label="success — #15803d" hex="#15803d" />
          <CvdComparisonRow label="danger — #b91c1c" hex="#b91c1c" />
          <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted, marginTop: theme.spacing.sm }}>
            AHORA
          </Text>
          <CvdComparisonRow label="warning — ahora" hex={theme.colors.warning} />
          <CvdComparisonRow label="success — ahora" hex={theme.colors.success} />
          <CvdComparisonRow label="danger — sin cambios" hex={theme.colors.danger} />
        </View>
      </Section>

      <Section
        title="Accesibilidad — WCAG 1.4.1 y 1.4.3"
        description="Confirmación formal de los tokens de color de este sistema. Metodología, pares y tabla completa: theme/colors.ts."
      >
        <Card>
          <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs }}>
            1.4.1 Uso del color (nivel A) — cumple
          </Text>
          <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg }}>
            Ningún estado (de cita ni genérico) se transmite solo por color. `Badge` obliga a nivel de
            tipos — `label` no es una prop opcional — así que no se puede compilar un Badge que muestre
            un estado sin su etiqueta de texto al lado.
          </Text>
          <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs }}>
            1.4.3 Contraste mínimo (nivel AA) — cumple
          </Text>
          <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
            Los 5 estados de cita, los 4 estados genéricos y los tres tonos de texto superan 4.5:1 sobre
            cada fondo REAL donde se usan (fondo de página, superficie de tarjeta, y los fondos suaves de
            Badge) — no solo contra blanco. El borde de Input y el anillo de foco superan el 3:1 exigido a
            componentes no textuales. Única excepción: el texto de un botón o input DESHABILITADO
            (2.01:1) — WCAG 1.4.3 exime explícitamente los componentes inactivos, no es un incumplimiento.
          </Text>
        </Card>
      </Section>

      <Section title="Tipografía">
        <View style={{ gap: theme.spacing.md }}>
          <Text style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}>heading1 — Título de pantalla</Text>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>heading2 — Título de sección</Text>
          <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>body — Texto por defecto de la app</Text>
          <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>bodyMedium — Texto enfatizado</Text>
          <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>small — Texto secundario / meta</Text>
          <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted }}>CAPTION — CHIPS Y ETIQUETAS</Text>
        </View>
      </Section>

      <Section title="Espaciado" description="4 / 8 / 12 / 16 / 24 / 32 / 48 — 16 (lg) coincide con el padding:16 que ya usa casi toda la app hoy.">
        <View style={{ gap: theme.spacing.sm }}>
          {(Object.entries(theme.spacing) as [string, number][]).map(([key, value]) => (
            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary, width: 48 }}>{key}</Text>
              <View style={{ width: value, height: 16, backgroundColor: theme.colors.primaryVivid, borderRadius: theme.radii.sm }} />
              <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted }}>{value}px</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Radios y sombras">
        <SwatchRow>
          {(Object.entries(theme.radii) as [string, number][]).map(([key, value]) => (
            <View key={key} style={{ alignItems: 'center', gap: theme.spacing.xs }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: Math.min(value, 32),
                  backgroundColor: theme.colors.primarySurface,
                  borderWidth: 1,
                  borderColor: theme.colors.primary,
                }}
              />
              <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted }}>
                {key} ({value})
              </Text>
            </View>
          ))}
          {(['sm', 'md', 'lg'] as const).map((key) => (
            <View key={key} style={{ alignItems: 'center', gap: theme.spacing.xs }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.surface,
                  ...theme.shadows[key],
                }}
              />
              <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted }}>shadows.{key}</Text>
            </View>
          ))}
        </SwatchRow>
      </Section>

      <Section title="Button" description="Variantes primario / secundario / peligro, más estado disabled y loading.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, alignItems: 'flex-start' }}>
          <View style={{ width: 160 }}>
            <Button label="Primario" onPress={() => {}} variant="primary" />
          </View>
          <View style={{ width: 160 }}>
            <Button label="Secundario" onPress={() => {}} variant="secondary" />
          </View>
          <View style={{ width: 160 }}>
            <Button label="Peligro" onPress={() => {}} variant="danger" />
          </View>
          <View style={{ width: 160 }}>
            <Button label="Deshabilitado" onPress={() => {}} disabled />
          </View>
          <View style={{ width: 160 }}>
            <Button label="Cargando…" onPress={() => setLoadingDemo((v) => !v)} loading={loadingDemo} />
          </View>
        </View>
      </Section>

      <Section title="Card">
        <Card>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs }}>
            Título de tarjeta
          </Text>
          <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
            Superficie base del sistema — fondo blanco, radio grande, sombra sutil. Cualquier contenido va dentro.
          </Text>
        </Card>
      </Section>

      <Section
        title="Badge"
        description="Siempre con su etiqueta de texto — nunca solo color (regla de accesibilidad del sistema)."
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {APPOINTMENT_STATUSES.map(({ status, tone }) => (
            <Badge key={status} label={STATUS_LABELS[status]} tone={tone} />
          ))}
          <Badge label="Marca" tone="primary" />
        </View>
      </Section>

      <Section title="Input" description="Borde neutro por defecto, teal al enfocar (tócalo), rojo + mensaje si hay error.">
        <View style={{ gap: theme.spacing.md, maxWidth: 360 }}>
          <Input label="Nombre" placeholder="Escribe algo…" value={inputValue} onChangeText={setInputValue} />
          <Input label="Teléfono" placeholder="600 000 000" error="Este campo es obligatorio." />
        </View>
      </Section>
    </ScrollView>
  );
}
