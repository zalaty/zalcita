import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import { todayDateStrInZone } from '@/lib/timezone';
import type { ScheduleException, WorkingHours } from '@/types/database';

const inputStyle = { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 };
const buttonStyle = { backgroundColor: '#111', padding: 14, borderRadius: 8 };
const buttonDisabledStyle = { ...buttonStyle, backgroundColor: '#ccc' };
const buttonTextStyle = { color: '#fff', textAlign: 'center' as const, fontWeight: '600' as const };
const formBoxStyle = { gap: 8, padding: 10, borderRadius: 8, backgroundColor: '#f7f7f7' };
const rowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  padding: 10,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: '#eee',
};

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
      <View style={{ gap: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Horario semanal</Text>
        {hoursError && <Text style={{ color: 'crimson' }}>{hoursError}</Text>}

        {loadingHours && !hours ? (
          <ActivityIndicator />
        ) : (
          WEEKDAYS.map(({ dow, label }) => {
            const daySlots = (hours ?? []).filter((h) => h.day_of_week === dow);
            const isEditingThisDay = editingSlot?.dayOfWeek === dow;

            return (
              <View key={dow} style={{ gap: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '600' }}>{label}</Text>

                {daySlots.length === 0 && !isEditingThisDay && <Text style={{ color: '#666' }}>Cerrado</Text>}

                {daySlots.map((slot) => (
                  <View key={slot.id} style={rowStyle}>
                    <Text>
                      {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <Pressable onPress={() => openEditSlot(slot)}>
                        <Text style={{ color: '#666' }}>Editar</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDeleteSlot(slot)} disabled={deletingSlotId === slot.id}>
                        <Text style={{ color: 'crimson' }}>{deletingSlotId === slot.id ? '…' : 'Quitar'}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}

                {isEditingThisDay ? (
                  <View style={formBoxStyle}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        placeholder="Inicio (HH:mm)"
                        value={slotStart}
                        onChangeText={setSlotStart}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <TextInput
                        placeholder="Fin (HH:mm)"
                        value={slotEnd}
                        onChangeText={setSlotEnd}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        onPress={handleSaveSlot}
                        disabled={!canSubmitSlot}
                        style={{ flex: 1, ...(canSubmitSlot ? buttonStyle : buttonDisabledStyle) }}
                      >
                        <Text style={buttonTextStyle}>{savingSlot ? 'Guardando…' : 'Guardar'}</Text>
                      </Pressable>
                      <Pressable
                        onPress={closeSlotForm}
                        style={{ flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' }}
                      >
                        <Text style={{ textAlign: 'center' }}>Cancelar</Text>
                      </Pressable>
                    </View>
                    {slotError && <Text style={{ color: 'crimson' }}>{slotError}</Text>}
                  </View>
                ) : (
                  <Pressable onPress={() => openNewSlot(dow)}>
                    <Text style={{ color: '#111', fontWeight: '600' }}>+ Añadir tramo</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </View>

      <View style={{ gap: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Excepciones (vacaciones, festivos…)</Text>
        {exceptionsError && <Text style={{ color: 'crimson' }}>{exceptionsError}</Text>}

        {loadingExceptions && !exceptions ? (
          <ActivityIndicator />
        ) : (
          <>
            {(exceptions ?? []).length === 0 && (
              <Text style={{ color: '#666' }}>No hay excepciones próximas.</Text>
            )}
            {(exceptions ?? []).map((exception) => (
              <View key={exception.id} style={rowStyle}>
                <View>
                  <Text style={{ fontWeight: '600' }}>{exception.date}</Text>
                  <Text style={{ color: '#666', fontSize: 13 }}>
                    {exception.start_time && exception.end_time
                      ? `Cerrado de ${exception.start_time.slice(0, 5)} a ${exception.end_time.slice(0, 5)}`
                      : 'Cerrado todo el día'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleDeleteException(exception)}
                  disabled={deletingExceptionId === exception.id}
                >
                  <Text style={{ color: 'crimson' }}>
                    {deletingExceptionId === exception.id ? '…' : 'Quitar'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {addingException ? (
          <View style={formBoxStyle}>
            <TextInput
              placeholder="Fecha (AAAA-MM-DD)"
              value={exceptionDate}
              onChangeText={setExceptionDate}
              style={inputStyle}
            />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setExceptionMode('full')}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: exceptionMode === 'full' ? '#111' : '#ccc',
                }}
              >
                <Text style={{ textAlign: 'center', fontWeight: exceptionMode === 'full' ? '700' : '400' }}>
                  Cerrado todo el día
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setExceptionMode('partial')}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: exceptionMode === 'partial' ? '#111' : '#ccc',
                }}
              >
                <Text style={{ textAlign: 'center', fontWeight: exceptionMode === 'partial' ? '700' : '400' }}>
                  Cerrar solo una franja
                </Text>
              </Pressable>
            </View>

            {exceptionMode === 'partial' && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, color: '#666' }}>
                  Indica la franja horaria que permanecerá CERRADA ese día — el resto del horario
                  habitual sigue abierto.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    placeholder="Cierra desde (HH:mm)"
                    value={exceptionStart}
                    onChangeText={setExceptionStart}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <TextInput
                    placeholder="Hasta (HH:mm)"
                    value={exceptionEnd}
                    onChangeText={setExceptionEnd}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </View>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={handleAddException}
                disabled={!canSubmitException}
                style={{ flex: 1, ...(canSubmitException ? buttonStyle : buttonDisabledStyle) }}
              >
                <Text style={buttonTextStyle}>{savingException ? 'Guardando…' : 'Guardar'}</Text>
              </Pressable>
              <Pressable
                onPress={closeExceptionForm}
                style={{ flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' }}
              >
                <Text style={{ textAlign: 'center' }}>Cancelar</Text>
              </Pressable>
            </View>
            {exceptionError && <Text style={{ color: 'crimson' }}>{exceptionError}</Text>}
          </View>
        ) : (
          <Pressable onPress={openAddException} style={buttonStyle}>
            <Text style={buttonTextStyle}>Añadir excepción</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
