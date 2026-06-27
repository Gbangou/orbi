/**
 * ScheduledRidePicker — Sélecteur de date/heure pour courses programmées
 *
 * Permet de programmer une course jusqu'à 7 jours à l'avance.
 * Interface: chip "Maintenant" vs "Programmer" avec date/heure.
 * Design Bolt-style — intégré dans le book.tsx.
 */
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { orbiTheme } from '@orbi/ui';

export type ScheduledRideMode = 'now' | 'scheduled';

export interface ScheduledRidePickerProps {
  mode: ScheduledRideMode;
  scheduledDate: string; // Format: YYYY-MM-DD
  scheduledTime: string; // Format: HH:MM
  onModeChange: (mode: ScheduledRideMode) => void;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
}

// Génère des options de créneaux horaires (toutes les 15 min, 30 min à l'avance)
function generateTimeSlots(): string[] {
  const slots: string[] = [];
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30); // Min 30 min à l'avance
  now.setSeconds(0, 0);
  // Arrondir au quart d'heure suivant
  const rem = now.getMinutes() % 15;
  if (rem > 0) now.setMinutes(now.getMinutes() + (15 - rem));

  for (let i = 0; i < 32; i++) {
    const d = new Date(now.getTime() + i * 15 * 60_000);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  return [...new Set(slots)].slice(0, 24); // Max 6h de créneaux
}

function generateDateOptions(): Array<{ label: string; value: string }> {
  const dates: Array<{ label: string; value: string }> = [];
  const today = new Date();
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];

  for (let i = 0; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const label = i === 0 ? `Aujourd'hui` : i === 1 ? 'Demain' : `${days[d.getDay()]} ${dd} ${months[d.getMonth()]}`;
    dates.push({ label, value: `${yyyy}-${mm}-${dd}` });
  }
  return dates;
}

export const ScheduledRidePicker = memo(function ScheduledRidePicker({
  mode,
  scheduledDate,
  scheduledTime,
  onModeChange,
  onDateChange,
  onTimeChange,
}: ScheduledRidePickerProps) {
  const [showTimeSlots, setShowTimeSlots] = useState(false);
  const timeSlots = generateTimeSlots();
  const dateOptions = generateDateOptions();

  return (
    <View style={styles.container}>
      {/* Mode toggle */}
      <View style={styles.toggle}>
        <Pressable
          onPress={() => onModeChange('now')}
          style={[styles.toggleBtn, mode === 'now' && styles.toggleBtnActive]}
        >
          <Text style={[styles.toggleLabel, mode === 'now' && styles.toggleLabelActive]}>
            Maintenant
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onModeChange('scheduled')}
          style={[styles.toggleBtn, mode === 'scheduled' && styles.toggleBtnActive]}
        >
          <Text style={[styles.toggleLabel, mode === 'scheduled' && styles.toggleLabelActive]}>
            ⏰ Programmer
          </Text>
        </Pressable>
      </View>

      {/* Date + time pickers (only when scheduled) */}
      {mode === 'scheduled' ? (
        <View style={styles.pickers}>
          {/* Date selector */}
          <View style={styles.pickerSection}>
            <Text style={styles.pickerLabel}>Date</Text>
            <View style={styles.dateChips}>
              {dateOptions.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => onDateChange(opt.value)}
                  style={[styles.dateChip, scheduledDate === opt.value && styles.dateChipActive]}
                >
                  <Text style={[styles.dateChipText, scheduledDate === opt.value && styles.dateChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Time selector */}
          <View style={styles.pickerSection}>
            <Text style={styles.pickerLabel}>Heure</Text>
            <Pressable
              onPress={() => setShowTimeSlots(!showTimeSlots)}
              style={styles.timeDisplay}
            >
              <Text style={styles.timeValue}>{scheduledTime || 'Choisir'}</Text>
              <Text style={styles.timeChevron}>{showTimeSlots ? '▲' : '▼'}</Text>
            </Pressable>
            {showTimeSlots ? (
              <View style={styles.timeGrid}>
                {timeSlots.map((slot) => (
                  <Pressable
                    key={slot}
                    onPress={() => { onTimeChange(slot); setShowTimeSlots(false); }}
                    style={[styles.timeSlot, scheduledTime === slot && styles.timeSlotActive]}
                  >
                    <Text style={[styles.timeSlotText, scheduledTime === slot && styles.timeSlotTextActive]}>
                      {slot}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {/* Confirmation info */}
          {scheduledDate && scheduledTime ? (
            <View style={styles.scheduledInfo}>
              <Text style={styles.scheduledInfoText}>
                📅 Course programmée le {dateOptions.find(d => d.value === scheduledDate)?.label} à {scheduledTime}
              </Text>
              <Text style={styles.scheduledInfoNote}>
                Orbi recherche votre chauffeur 15 min avant
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 12 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderRadius: 12, padding: 3, gap: 2,
  },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  toggleLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: orbiTheme.colors.textMuted },
  toggleLabelActive: { color: orbiTheme.colors.text },

  pickers: { gap: 14 },
  pickerSection: { gap: 8 },
  pickerLabel: { fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold', color: orbiTheme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },

  dateChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dateChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: orbiTheme.colors.backgroundAlt, borderWidth: 1, borderColor: orbiTheme.colors.border },
  dateChipActive: { backgroundColor: orbiTheme.colors.text, borderColor: orbiTheme.colors.text },
  dateChipText: { fontSize: 12, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: orbiTheme.colors.textSoft },
  dateChipTextActive: { color: '#FFFFFF' },

  timeDisplay: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: orbiTheme.colors.backgroundAlt, borderRadius: 12,
    borderWidth: 1, borderColor: orbiTheme.colors.border, paddingHorizontal: 14, paddingVertical: 12,
  },
  timeValue: { fontSize: 16, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: orbiTheme.colors.text },
  timeChevron: { fontSize: 12, color: orbiTheme.colors.textMuted },

  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  timeSlot: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1, borderColor: orbiTheme.colors.border,
    minWidth: 60, alignItems: 'center',
  },
  timeSlotActive: { backgroundColor: orbiTheme.colors.teal, borderColor: orbiTheme.colors.teal },
  timeSlotText: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: orbiTheme.colors.textSoft },
  timeSlotTextActive: { color: '#FFFFFF' },

  scheduledInfo: {
    backgroundColor: 'rgba(0,201,167,0.06)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(0,201,167,0.22)', padding: 12, gap: 4,
  },
  scheduledInfoText: { fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: orbiTheme.colors.teal },
  scheduledInfoNote: { fontSize: 12, color: orbiTheme.colors.textMuted, fontFamily: 'Inter_400Regular' },
});
