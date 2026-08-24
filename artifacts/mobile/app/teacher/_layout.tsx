import React from 'react';
import { Stack } from 'expo-router';

export default function TeacherLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="attendance" />
      <Stack.Screen name="marks" />
      <Stack.Screen name="salary" />
      <Stack.Screen name="fees" />
      <Stack.Screen name="classes" />
      <Stack.Screen name="exams" />
    </Stack>
  );
}
