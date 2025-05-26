
"use client";

import { Plane, Star, Briefcase, Pencil, CalendarDays, Users, Settings, Palette, CalendarX } from 'lucide-react';

export const VacationIcon = (props: React.ComponentProps<typeof Plane>) => <Plane {...props} />;
export const PreAssignedIcon = (props: React.ComponentProps<typeof Star>) => <Star {...props} />;
export const WorkIcon = (props: React.ComponentProps<typeof Briefcase>) => <Briefcase {...props} />;
export const EditIcon = (props: React.ComponentProps<typeof Pencil>) => <Pencil {...props} />;
export const CalendarIcon = (props: React.ComponentProps<typeof CalendarDays>) => <CalendarDays {...props} />;
export const DoctorsIcon = (props: React.ComponentProps<typeof Users>) => <Users {...props} />;
export const PreferencesIcon = (props: React.ComponentProps<typeof Settings>) => <Settings {...props} />;
export const ThemeIcon = (props: React.ComponentProps<typeof Palette>) => <Palette {...props} />;
export const CalendarXIcon = (props: React.ComponentProps<typeof CalendarX>) => <CalendarX {...props} />;
