/**
 * ScheduledRidePicker — Sélecteur de date/heure pour courses programmées
 *
 * Permet de programmer une course jusqu'à 7 jours à l'avance.
 * Interface: chip "Maintenant" vs "Programmer" avec date/heure.
 * Design Bolt-style — intégré dans le book.tsx.
 */
import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OrbiTheme } from '@orbi/ui';
import { useOrbiTheme } from '@orbi/ui/native';

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

function CalendarGlyph() {
  const theme = useOrbiTheme();
  const glyphStyles = useMemo(() => makeGlyphStyles(theme), [theme]);
  return (
    <View style={glyphStyles.calendar}>
      <View style={glyphStyles.calendarRings}>
        <View style={glyphStyles.calendarRing} />
        <View style={glyphStyles.calendarRing} />
      </View>
      <View style={glyphStyles.calendarLine} />
      <View style={glyphStyles.calendarDotRow}>
        <View style={glyphStyles.calendarDot} />
        <View style={glyphStyles.calendarDot} />
      </View>
    </View>
  );
}

function ChevronGlyph({ expanded }: { expanded: boolean }) {
  const theme = useOrbiTheme();
  const glyphStyles = useMemo(() => makeGlyphStyles(theme), [theme]);
  return (
    <View
      style={[
        glyphStyles.chevron,
        expanded ? glyphStyles.chevronExpanded : null,
      ]}
    >
      <View style={glyphStyles.chevronLineLeft} />
      <View style={glyphStyles.chevronLineRight} />
    </View>
  );
}

export const ScheduledRidePicker = memo(function ScheduledRidePicker({
  mode,
  scheduledDate,
  scheduledTime,
  onModeChange,
  onDateChange,
  onTimeChange,
}: ScheduledRidePickerProps) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
            Programmer
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
              <ChevronGlyph expanded={showTimeSlots} />
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
              <View style={styles.scheduledInfoHeader}>
                <CalendarGlyph />
                <View style={styles.scheduledInfoCopy}>
                  <Text style={styles.scheduledInfoText}>
                    Course programmée le {dateOptions.find(d => d.value === scheduledDate)?.label} à {scheduledTime}
                  </Text>
                  <Text style={styles.scheduledInfoNote}>
                    Orbi recherche votre chauffeur 15 min avant
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const makeStyles = (_theme: OrbiTheme) => StyleSheet.create({
  container: { gap: 9 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F3F3',
    borderRadius: 4, padding: 3, gap: 2,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 4, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E8E8' },
  toggleLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: '#6B6B6B' },
  toggleLabelActive: { color: '#111111' },

  pickers: { gap: 11 },
  pickerSection: { gap: 7 },
  pickerLabel: { fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold', color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: 0 },

  dateChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dateChip: { borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#F7F7F7', borderWidth: 1, borderColor: '#E8E8E8' },
  dateChipActive: { backgroundColor: '#111111', borderColor: '#111111' },
  dateChipText: { fontSize: 12, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: '#5F5F5F' },
  dateChipTextActive: { color: '#FFFFFF' },

  timeDisplay: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#F7F7F7', borderRadius: 4,
    borderWidth: 1, borderColor: '#E8E8E8', paddingHorizontal: 13, paddingVertical: 10,
  },
  timeValue: { fontSize: 16, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: '#111111' },

  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  timeSlot: {
    borderRadius: 4, paddingHorizontal: 9, paddingVertical: 6,
    backgroundColor: '#F7F7F7',
    borderWidth: 1, borderColor: '#E8E8E8',
    minWidth: 60, alignItems: 'center',
  },
  timeSlotActive: { backgroundColor: '#111111', borderColor: '#111111' },
  timeSlotText: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: '#5F5F5F' },
  timeSlotTextActive: { color: '#FFFFFF' },

  scheduledInfo: {
    backgroundColor: '#F7F7F7', borderRadius: 4,
    borderWidth: 1, borderColor: '#E8E8E8', padding: 10, gap: 4,
  },
  scheduledInfoHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  scheduledInfoCopy: { flex: 1, gap: 4 },
  scheduledInfoText: { fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: '#111111' },
  scheduledInfoNote: { fontSize: 12, color: '#6B6B6B', fontFamily: 'Inter_400Regular' },
});

const makeGlyphStyles = (_theme: OrbiTheme) => StyleSheet.create({
  calendar: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#111111',
    paddingHorizontal: 4,
    paddingTop: 5,
  },
  calendarRings: {
    position: 'absolute',
    top: -3,
    left: 5,
    right: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarRing: {
    width: 3,
    height: 7,
    borderRadius: 2,
    backgroundColor: '#111111',
  },
  calendarLine: {
    height: 1.5,
    borderRadius: 2,
    backgroundColor: '#CFCFCF',
    marginBottom: 5,
  },
  calendarDotRow: {
    flexDirection: 'row',
    gap: 4,
  },
  calendarDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#111111',
  },
  chevron: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  chevronLineLeft: {
    position: 'absolute',
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#6B6B6B',
    transform: [{ translateX: -3 }, { rotate: '45deg' }],
  },
  chevronLineRight: {
    position: 'absolute',
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#6B6B6B',
    transform: [{ translateX: 3 }, { rotate: '-45deg' }],
  },
});
