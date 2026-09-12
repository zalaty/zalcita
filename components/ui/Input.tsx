import { useState } from 'react';
import { Text, TextInput, View, type TextInputProps, type TextStyle } from 'react-native';
import { theme } from '@/theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

// El navegador añade su propio anillo de foco (outline) por defecto — en
// Chrome, negro — que compite visualmente con el borde teal del foco
// propio del Input (se veía como un borde negro grueso al enfocar,
// comprobado en pantalla). outlineStyle/outlineWidth no existen en el tipo
// TextStyle de react-native (son extensiones web de react-native-web), de
// ahí el escape de tipos — igual que boxShadow en theme/shadows.ts. Inocuo
// en nativo: no hay outline de navegador que suprimir.
const WEB_NO_NATIVE_OUTLINE = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

// Input de texto base — borde neutro por defecto, teal y más grueso al
// enfocar (no solo cambia de color: el grosor es una segunda señal, no
// dependiente del matiz), rojo + mensaje de ayuda si hay error. Pensado
// para sustituir al `inputStyle` suelto que hoy se repite (copiado) en
// varias pantallas.
export function Input({ label, error, style, onFocus, onBlur, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);

  const borderColor = error ? theme.colors.danger : focused ? theme.colors.primary : theme.colors.borderStrong;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {label && <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>{label}</Text>}
      <TextInput
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          {
            borderWidth: focused ? 2 : 1,
            borderColor,
            borderRadius: theme.radii.md,
            padding: theme.spacing.md,
            fontSize: theme.fontSizes.base,
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.surface,
          },
          WEB_NO_NATIVE_OUTLINE,
          style,
        ]}
      />
      {error && <Text style={{ ...theme.textStyles.small, color: theme.colors.danger }}>{error}</Text>}
    </View>
  );
}
