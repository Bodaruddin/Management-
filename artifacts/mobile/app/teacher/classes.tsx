import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, Alert, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';

export default function TeacherClasses() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { classes, addClass, updateClass, deleteClass } = useApp();

  const [newClassName, setNewClassName] = useState('');
  const [editingClass, setEditingClass] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const hasPermission = user?.role === 'admin' || user?.permissions?.manageClasses === true;

  const topPad = Platform.OS === 'web' ? 12 : insets.top;
  const botPad = Platform.OS === 'web' ? 84 : insets.bottom + 80;

  const handleAdd = async () => {
    const name = newClassName.trim();
    if (!name) {
      Alert.alert('Enter a name', 'Please type a class name before tapping +');
      inputRef.current?.focus();
      return;
    }
    if (classes.includes(name)) {
      Alert.alert('Duplicate', `"${name}" already exists`);
      return;
    }
    if (isAdding) return;
    setIsAdding(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await addClass(name);
      setNewClassName('');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to add class. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const openEdit = (cls: string) => {
    setEditingClass(cls);
    setEditValue(cls);
  };

  const handleSaveEdit = async () => {
    if (!editingClass) return;
    const trimmed = editValue.trim();
    if (!trimmed) { Alert.alert('Validation', 'Class name cannot be empty'); return; }
    if (trimmed !== editingClass && classes.includes(trimmed)) {
      Alert.alert('Duplicate', `"${trimmed}" already exists`);
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateClass(editingClass, trimmed);
      setEditingClass(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to rename class. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await deleteClass(confirmDelete);
      setConfirmDelete(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to delete class. Please try again.');
    }
  };

  const s = styles(colors);

  // ── Access Denied ─────────────────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/teacher')}>
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Manage Classes</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.deniedContainer}>
          <View style={[s.deniedIcon, { backgroundColor: colors.destructive + '15' }]}>
            <Feather name="lock" size={40} color={colors.destructive} />
          </View>
          <Text style={[s.deniedTitle, { color: colors.text }]}>Access Restricted</Text>
          <Text style={[s.deniedSub, { color: colors.mutedForeground }]}>
            You don't have permission to manage classes.{'\n'}Contact your admin to grant the{' '}
            <Text style={{ fontWeight: '700', color: colors.text }}>"Manage Classes"</Text> permission.
          </Text>
        </View>
      </View>
    );
  }

  // ── Full Class Management ─────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/teacher')}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Manage Classes</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Add Class Row */}
      <View style={[s.addRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TextInput
          ref={inputRef}
          style={[s.addInput, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
          value={newClassName}
          onChangeText={setNewClassName}
          placeholder="New class name (e.g. Class 11)..."
          placeholderTextColor={colors.mutedForeground}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
          editable={!isAdding}
        />
        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: isAdding ? colors.primary + '80' : colors.primary }]}
          onPress={handleAdd}
          activeOpacity={0.8}
          disabled={isAdding}
        >
          {isAdding
            ? <ActivityIndicator size="small" color="#fff" />
            : <Feather name="plus" size={20} color="#fff" />
          }
        </TouchableOpacity>
      </View>

      {/* Class List */}
      <FlatList
        data={classes}
        keyExtractor={item => item}
        contentContainerStyle={{ padding: 16, paddingBottom: botPad, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="layers" size={40} color={colors.mutedForeground} />
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No classes yet. Add one above.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[s.classRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.classIcon, { backgroundColor: colors.primary + '15' }]}>
              <Feather name="layers" size={18} color={colors.primary} />
            </View>
            <Text style={[s.className, { color: colors.text }]}>{item}</Text>
            <View style={s.rowActions}>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: colors.primary + '15' }]}
                onPress={() => openEdit(item)}
                activeOpacity={0.8}
              >
                <Feather name="edit-2" size={15} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: colors.destructive + '15' }]}
                onPress={() => setConfirmDelete(item)}
                activeOpacity={0.8}
              >
                <Feather name="trash-2" size={15} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Edit Modal */}
      <Modal visible={!!editingClass} animationType="fade" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: colors.card }]}>
            <View style={[mo.header, { borderBottomColor: colors.border }]}>
              <Text style={[mo.title, { color: colors.text }]}>Rename Class</Text>
              <TouchableOpacity onPress={() => setEditingClass(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 8 }}>Class Name</Text>
              <TextInput
                style={[mo.input, { backgroundColor: colors.muted, color: colors.text, borderColor: colors.border }]}
                value={editValue}
                onChangeText={setEditValue}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveEdit}
              />
            </View>
            <View style={[mo.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[mo.btn, { borderColor: colors.border }]} onPress={() => setEditingClass(null)}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mo.btn, { flex: 2, backgroundColor: colors.primary }]} onPress={handleSaveEdit}>
                <Feather name="check" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal visible={!!confirmDelete} animationType="fade" transparent>
        <View style={mo.overlay}>
          <View style={[mo.sheet, { backgroundColor: colors.card }]}>
            <View style={[mo.header, { borderBottomColor: colors.border }]}>
              <Text style={[mo.title, { color: colors.text }]}>Delete Class</Text>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ fontSize: 15, color: colors.text, lineHeight: 22 }}>
                Remove <Text style={{ fontWeight: '700' }}>"{confirmDelete}"</Text> from the class list?{'\n'}
                <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Students assigned to this class will not be affected.</Text>
              </Text>
            </View>
            <View style={[mo.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[mo.btn, { borderColor: colors.border }]} onPress={() => setConfirmDelete(null)}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mo.btn, { flex: 2, backgroundColor: colors.destructive }]} onPress={handleDelete}>
                <Feather name="trash-2" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const mo = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 },
  sheet: { borderRadius: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 13 },
});

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  addRow: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderBottomWidth: 1,
  },
  addInput: {
    flex: 1, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
  },
  addBtn: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  classRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14,
    padding: 14, marginBottom: 10, gap: 12,
    borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  classIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  className: { flex: 1, fontSize: 15, fontWeight: '600' },
  rowActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  // Access denied
  deniedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  deniedIcon: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  deniedTitle: { fontSize: 22, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  deniedSub: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
});
