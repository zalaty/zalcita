import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import { theme } from '@/theme';
import { Button, Card, Input } from '@/components/ui';
import { addMonthsToMonthStr, monthGridCells, monthLabel, todayDateStrInZone } from '@/lib/timezone';
import type { ScheduleException, WorkingHours } from '@/types/database';

// Lunes primero, aunque en la BD domingo sea 0 (day_of_week 0=domingo..6=sábado).
const WEEKDAYS: { dow: number; label: string }[] = [
  { dow: 1, label: 'Lunes' },
  { dow: 2, label: 'Martes' },
  { dow: 3, label: 'Miércoles' },
  { dow: 4, label: 'Jueves' },
  { dow: 5, label: 'Viernes' },
  { dow: 6, label: 'Sábado' },
  { dow: 0, label: 'Domingo' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];
const WEEKDAY_HEADER = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// Fila-chip compartida por tramos de horario y excepciones: borde + sombra
// sutil para que se distingan de la Card blanca que las contiene (misma
// lección que los huecos de disponibilidad.tsx — sombra sola no basta
// cuando fila y contenedor comparten el mismo blanco).
const chipRowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  padding: theme.spacing.sm,
  borderRadius: theme.radii.md,
  borderWidth: 1,
  borderColor: theme.colors.border,
  backgroundColor: theme.colors.surface,
  ...theme.shadows.sm,
};

function chipStyle(selected: boolean) {
  return {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: selected ? theme.colors.primary : theme.colors.border,
    backgroundColor: selected ? theme.colors.primary : 'transparent',
  };
}

function chipTextStyle(selected: boolean) {
  return {
    fontSize: theme.fontSizes.sm,
    color: selected ? theme.colors.textOnPrimary : theme.colors.textPrimary,
    fontWeight: selected ? theme.fontWeights.semibold : theme.fontWeights.regular,
  };
}

function timeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isValidDateStr(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Reemplaza el TextInput libre "HH:mm" por dos filas de chips (hora +
// minutos en pasos de 15) — a prueba de "25:99" por construcción, sin
// depender de ningún selector nativo (ver conversación: el "estándar" del
// ecosistema, @react-native-community/datetimepicker, no tiene ninguna
// implementación para web).
function TimeSelector({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [h, m] = value.includes(':') ? value.split(':') : ['', ''];

  return (
    <View style={{ gap: theme.spacing.xs, flex: 1 }}>
      <Text style={{ ...theme.textStyles.caption, color: theme.colors.textSecondary }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          {HOURS.map((hh) => (
            <Pressable key={hh} onPress={() => onChange(`${hh}:${m || '00'}`)} style={chipStyle(h === hh)}>
              <Text style={chipTextStyle(h === hh)}>{hh}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
        {MINUTES.map((mm) => (
          <Pressable key={mm} onPress={() => onChange(`${h || '00'}:${mm}`)} style={chipStyle(m === mm)}>
            <Text style={chipTextStyle(m === mm)}>{mm}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Rejilla de mes para elegir la fecha de una excepción — construida sobre
// la aritmética de mes que ya vive en lib/timezone.ts (probada en
// resumen.tsx), no lógica de fechas nueva.
function MonthCalendar({
  selectedDate,
  minDate,
  onSelect,
}: {
  selectedDate: string;
  minDate: string;
  onSelect: (dateStr: string) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => (selectedDate || minDate).slice(0, 7));
  const cells = monthGridCells(viewMonth);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => setViewMonth((m) => addMonthsToMonthStr(m, -1))} style={{ padding: theme.spacing.sm }}>
          <Text style={{ fontSize: theme.fontSizes.lg, color: theme.colors.textPrimary }}>‹</Text>
        </Pressable>
        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            ...theme.textStyles.small,
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.textPrimary,
            textTransform: 'capitalize',
          }}
        >
          {monthLabel(viewMonth)}
        </Text>
        <Pressable onPress={() => setViewMonth((m) => addMonthsToMonthStr(m, 1))} style={{ padding: theme.spacing.sm }}>
          <Text style={{ fontSize: theme.fontSizes.lg, color: theme.colors.textPrimary }}>›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_HEADER.map((d, i) => (
          <Text
            key={i}
            style={{ width: `${100 / 7}%`, textAlign: 'center', ...theme.textStyles.caption, color: theme.colors.textMuted }}
          >
            {d}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((dateStr, i) => {
          if (!dateStr) return <View key={`blank-${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const disabled = dateStr < minDate;
          const selected = dateStr === selectedDate;
          return (
            <Pressable
              key={dateStr}
              disabled={disabled}
              onPress={() => onSelect(dateStr)}
              style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.colors.primary : 'transparent',
                  opacity: disabled ? 0.3 : 1,
                }}
              >
                <Text style={{ color: selected ? theme.colors.textOnPrimary : theme.colors.textPrimary, fontSize: theme.fontSizes.sm }}>
                  {Number(dateStr.slice(8, 10))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type EditingSlot = { dayOfWeek: number; original: WorkingHours | null } | null;

export default function Horarios() {
  const { business } = useBusiness();

  // Horario semanal
  const [hours, setHours] = useState<WorkingHours[] | null>(null);
  const [loadingHours, setLoadingHours] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);

  const [editingSlot, setEditingSlot] = useState<EditingSlot>(null);
  const [slotStart, setSlotStart] = useState('');
  const [slotEnd, setSlotEnd] = useState('');
  const [savingSlot, setSavingSlot] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);

  // Excepciones
  const [exceptions, setExceptions] = useState<ScheduleException[] | null>(null);
  const [loadingExceptions, setLoadingExceptions] = useState(false);
  const [exceptionsError, setExceptionsError] = useState<string | null>(null);
  const [deletingExceptionId, setDeletingExceptionId] = useState<string | null>(null);

  const [addingException, setAddingException] = useState(false);
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionMode, setExceptionMode] = useState<'full' | 'partial'>('full');
  const [exceptionStart, setExceptionStart] = useState('');
  const [exceptionEnd, setExceptionEnd] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [savingException, setSavingException] = useState(false);
  const [exceptionError, setExceptionError] = useState<string | null>(null);

  // Mismo patrón que servicios.tsx/disponibilidad.tsx: useFocusEffect, no un
  // useEffect suelto, para que se recargue también al volver a esta pestaña.
  const fetchHours = useCallback(() => {
    if (!business) return;
    let cancelled = false;
    setLoadingHours(true);
    setHoursError(null);

    (async () => {
      const { data, error } = await supabase
        .from('working_hours')
        .select('*')
        .eq('business_id', business.id)
        .is('member_id', null)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (cancelled) return;
      if (error) {
        setHoursError('No se pudo cargar el horario.');
        setLoadingHours(false);
        return;
      }
      setHours(data ?? []);
      setLoadingHours(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business]);

  useFocusEffect(fetchHours);

  const fetchExceptions = useCallback(() => {
    if (!business) return;
    let cancelled = false;
    setLoadingExceptions(true);
    setExceptionsError(null);

    (async () => {
      const today = todayDateStrInZone(business.timezone);
      const { data, error } = await supabase
        .from('schedule_exceptions')
        .select('*')
        .eq('business_id', business.id)
        .is('member_id', null)
        .gte('date', today)
        .order('date', { ascending: true });

      if (cancelled) return;
      if (error) {
        setExceptionsError('No se pudieron cargar las excepciones.');
        setLoadingExceptions(false);
        return;
      }
      setExceptions(data ?? []);
      setLoadingExceptions(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business]);

  useFocusEffect(fetchExceptions);

  function openNewSlot(dayOfWeek: number) {
    setEditingSlot({ dayOfWeek, original: null });
    setSlotStart('');
    setSlotEnd('');
    setSlotError(null);
  }

  function openEditSlot(slot: WorkingHours) {
    setEditingSlot({ dayOfWeek: slot.day_of_week, original: slot });
    setSlotStart(slot.start_time.slice(0, 5));
    setSlotEnd(slot.end_time.slice(0, 5));
    setSlotError(null);
  }

  function closeSlotForm() {
    setEditingSlot(null);
    setSlotError(null);
  }

  const slotStartMin = timeToMinutes(slotStart);
  const slotEndMin = timeToMinutes(slotEnd);
  const canSubmitSlot = slotStartMin !== null && slotEndMin !== null && slotEndMin > slotStartMin && !savingSlot;

  async function handleSaveSlot() {
    if (!business || !editingSlot || slotStartMin === null || slotEndMin === null) return;
    setSlotError(null);

    // Sin solape con los OTROS tramos ya guardados ese mismo día (excluye
    // el propio tramo si se está editando).
    const daySlots = (hours ?? []).filter(
      (h) => h.day_of_week === editingSlot.dayOfWeek && h.id !== editingSlot.original?.id
    );
    const overlaps = daySlots.some((h) => {
      const otherStart = timeToMinutes(h.start_time.slice(0, 5));
      const otherEnd = timeToMinutes(h.end_time.slice(0, 5));
      if (otherStart === null || otherEnd === null) return false;
      return slotStartMin < otherEnd && slotEndMin > otherStart;
    });
    if (overlaps) {
      setSlotError('Ese tramo se solapa con otro ya guardado ese día.');
      return;
    }

    setSavingSlot(true);
    const payload = { start_time: slotStart, end_time: slotEnd };

    if (editingSlot.original) {
      const { error } = await supabase.from('working_hours').update(payload).eq('id', editingSlot.original.id);
      if (error) {
        setSlotError('No se pudo guardar el tramo. Inténtalo de nuevo.');
        setSavingSlot(false);
        return;
      }
    } else {
      const { error } = await supabase.from('working_hours').insert({
        business_id: business.id,
        member_id: null,
        day_of_week: editingSlot.dayOfWeek,
        start_time: slotStart,
        end_time: slotEnd,
      });
      if (error) {
        setSlotError('No se pudo crear el tramo. Inténtalo de nuevo.');
        setSavingSlot(false);
        return;
      }
    }

    setSavingSlot(false);
    setEditingSlot(null);
    fetchHours();
  }

  async function handleDeleteSlot(slot: WorkingHours) {
    setHoursError(null);
    setDeletingSlotId(slot.id);
    const { error } = await supabase.from('working_hours').delete().eq('id', slot.id);
    setDeletingSlotId(null);
    if (error) {
      setHoursError('No se pudo quitar el tramo.');
      return;
    }
    fetchHours();
  }

  function openAddException() {
    setAddingException(true);
    setExceptionDate('');
    setExceptionMode('full');
    setExceptionStart('');
    setExceptionEnd('');
    setExceptionReason('');
    setExceptionError(null);
  }

  function closeExceptionForm() {
    setAddingException(false);
    setExceptionError(null);
  }

  const today = business ? todayDateStrInZone(business.timezone) : '';
  const exceptionStartMin = timeToMinutes(exceptionStart);
  const exceptionEndMin = timeToMinutes(exceptionEnd);
  const canSubmitException =
    isValidDateStr(exceptionDate) &&
    exceptionDate >= today &&
    (exceptionMode === 'full' ||
      (exceptionStartMin !== null && exceptionEndMin !== null && exceptionEndMin > exceptionStartMin)) &&
    !savingException;

  async function handleAddException() {
    if (!business || !canSubmitException) return;
    setSavingException(true);
    setExceptionError(null);

    const { error } = await supabase.from('schedule_exceptions').insert({
      business_id: business.id,
      member_id: null,
      date: exceptionDate,
      is_closed: true,
      start_time: exceptionMode === 'partial' ? exceptionStart : null,
      end_time: exceptionMode === 'partial' ? exceptionEnd : null,
      reason: exceptionReason.trim() === '' ? null : exceptionReason.trim(),
    });

    if (error) {
      setExceptionError('No se pudo guardar la excepción. Inténtalo de nuevo.');
      setSavingException(false);
      return;
    }

    setSavingException(false);
    setAddingException(false);
    fetchExceptions();
  }

  async function handleDeleteException(exception: ScheduleException) {
    setExceptionsError(null);
    setDeletingExceptionId(exception.id);
    const { error } = await supabase.from('schedule_exceptions').delete().eq('id', exception.id);
    setDeletingExceptionId(null);
    if (error) {
      setExceptionsError('No se pudo quitar la excepción.');
      return;
    }
    fetchExceptions();
  }

  if (!business) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          width: '100%',
          maxWidth: theme.layout.panelMaxWidth,
          alignSelf: 'center',
        }}
      >
        <Card>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
            Horario semanal
          </Text>
          {hoursError && (
            <Text style={{ ...theme.textStyles.body, color: theme.colors.danger, marginBottom: theme.spacing.sm }}>
              {hoursError}
            </Text>
          )}

          {loadingHours && !hours ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <View style={{ gap: theme.spacing.lg }}>
              {WEEKDAYS.map(({ dow, label }) => {
                const daySlots = (hours ?? []).filter((h) => h.day_of_week === dow);
                const isEditingThisDay = editingSlot?.dayOfWeek === dow;

                return (
                  <View key={dow} style={{ gap: theme.spacing.sm }}>
                    <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>{label}</Text>

                    {daySlots.length === 0 && !isEditingThisDay && (
                      <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>Cerrado</Text>
                    )}

                    {daySlots.map((slot) => (
                      <View key={slot.id} style={chipRowStyle}>
                        <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>
                          {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: theme.spacing.lg }}>
                          <Pressable onPress={() => openEditSlot(slot)}>
                            <Text style={{ ...theme.textStyles.small, color: theme.colors.primary }}>Editar</Text>
                          </Pressable>
                          <Pressable onPress={() => handleDeleteSlot(slot)} disabled={deletingSlotId === slot.id}>
                            <Text style={{ ...theme.textStyles.small, color: theme.colors.danger }}>
                              {deletingSlotId === slot.id ? '…' : 'Quitar'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}

                    {isEditingThisDay ? (
                      <View
                        style={{
                          gap: theme.spacing.sm,
                          padding: theme.spacing.sm,
                          borderRadius: theme.radii.md,
                          backgroundColor: theme.colors.background,
                        }}
                      >
                        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                          <TimeSelector label="Inicio" value={slotStart} onChange={setSlotStart} />
                          <TimeSelector label="Fin" value={slotEnd} onChange={setSlotEnd} />
                        </View>
                        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                          <View style={{ flex: 1 }}>
                            <Button
                              label={savingSlot ? 'Guardando…' : 'Guardar'}
                              onPress={handleSaveSlot}
                              disabled={!canSubmitSlot}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button label="Cancelar" onPress={closeSlotForm} variant="secondary" />
                          </View>
                        </View>
                        {slotError && (
                          <Text style={{ ...theme.textStyles.small, color: theme.colors.danger }}>{slotError}</Text>
                        )}
                      </View>
                    ) : (
                      <Pressable onPress={() => openNewSlot(dow)}>
                        <Text style={{ ...theme.textStyles.small, fontWeight: theme.fontWeights.semibold, color: theme.colors.primary }}>
                          + Añadir tramo
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        <Card>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
            Excepciones (vacaciones, festivos…)
          </Text>
          {exceptionsError && (
            <Text style={{ ...theme.textStyles.body, color: theme.colors.danger, marginBottom: theme.spacing.sm }}>
              {exceptionsError}
            </Text>
          )}

          {loadingExceptions && !exceptions ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
              {(exceptions ?? []).length === 0 && (
                <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>
                  No hay excepciones próximas.
                </Text>
              )}
              {(exceptions ?? []).map((exception) => (
                <View key={exception.id} style={chipRowStyle}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>
                      {exception.date}
                    </Text>
                    <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>
                      {exception.start_time && exception.end_time
                        ? `Cerrado de ${exception.start_time.slice(0, 5)} a ${exception.end_time.slice(0, 5)}`
                        : 'Cerrado todo el día'}
                      {exception.reason ? ` — ${exception.reason}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleDeleteException(exception)}
                    disabled={deletingExceptionId === exception.id}
                  >
                    <Text style={{ ...theme.textStyles.small, color: theme.colors.danger }}>
                      {deletingExceptionId === exception.id ? '…' : 'Quitar'}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {addingException ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>Fecha</Text>
              <MonthCalendar selectedDate={exceptionDate} minDate={today} onSelect={setExceptionDate} />

              <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                <Pressable
                  onPress={() => setExceptionMode('full')}
                  style={{
                    flex: 1,
                    padding: theme.spacing.sm,
                    borderRadius: theme.radii.md,
                    borderWidth: 1,
                    borderColor: exceptionMode === 'full' ? theme.colors.primary : theme.colors.border,
                    backgroundColor: exceptionMode === 'full' ? theme.colors.primarySurface : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      textAlign: 'center',
                      ...theme.textStyles.small,
                      fontWeight: exceptionMode === 'full' ? theme.fontWeights.bold : theme.fontWeights.regular,
                      color: theme.colors.textPrimary,
                    }}
                  >
                    Cerrado todo el día
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setExceptionMode('partial')}
                  style={{
                    flex: 1,
                    padding: theme.spacing.sm,
                    borderRadius: theme.radii.md,
                    borderWidth: 1,
                    borderColor: exceptionMode === 'partial' ? theme.colors.primary : theme.colors.border,
                    backgroundColor: exceptionMode === 'partial' ? theme.colors.primarySurface : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      textAlign: 'center',
                      ...theme.textStyles.small,
                      fontWeight: exceptionMode === 'partial' ? theme.fontWeights.bold : theme.fontWeights.regular,
                      color: theme.colors.textPrimary,
                    }}
                  >
                    Cerrar solo una franja
                  </Text>
                </Pressable>
              </View>

              {exceptionMode === 'partial' && (
                <View style={{ gap: theme.spacing.sm }}>
                  <Text style={{ ...theme.textStyles.caption, color: theme.colors.textSecondary }}>
                    Indica la franja horaria que permanecerá CERRADA ese día — el resto del horario
                    habitual sigue abierto.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                    <TimeSelector label="Cierra desde" value={exceptionStart} onChange={setExceptionStart} />
                    <TimeSelector label="Hasta" value={exceptionEnd} onChange={setExceptionEnd} />
                  </View>
                </View>
              )}

              <Input
                placeholder="Motivo (opcional, se mostrará al cliente)"
                value={exceptionReason}
                onChangeText={setExceptionReason}
              />

              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={savingException ? 'Guardando…' : 'Guardar'}
                    onPress={handleAddException}
                    disabled={!canSubmitException}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Cancelar" onPress={closeExceptionForm} variant="secondary" />
                </View>
              </View>
              {exceptionError && (
                <Text style={{ ...theme.textStyles.small, color: theme.colors.danger }}>{exceptionError}</Text>
              )}
            </View>
          ) : (
            <Button label="Añadir excepción" onPress={openAddException} />
          )}
        </Card>
      </ScrollView>
    </View>
  );
}
