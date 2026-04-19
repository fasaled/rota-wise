

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/context/language-context';
import type { InfoBarMessage } from '@/hooks/use-info-bar';
import {
  Trash2,
  Edit3,
  Save,
  Clock,
  Calendar,
  Users,
  Download,
  Upload,
  CopyCheck,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { ScheduleVersion, ScheduleFormValues, Schedule, SerializedScheduleFormValues, SerializedSchedule } from '@/lib/types';
import {
  loadScheduleVersions,
  saveScheduleVersion,
  updateScheduleVersion,
  deleteScheduleVersion,
  getScheduleVersion,
  deserializeScheduleFormValues,
  deserializeSchedule,
  serializeScheduleFormValues,
  serializeSchedule,
} from '@/lib/schedule-storage';

interface ScheduleVersionsManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadVersion: (parameters: ScheduleFormValues, schedule?: Schedule, warnings?: string[]) => void;
  currentParameters?: ScheduleFormValues;
  currentSchedule?: Schedule;
  currentWarnings?: string[];
  onNotify?: (msg: Omit<InfoBarMessage, 'id'>) => void;
}

interface SaveVersionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  isLoading: boolean;
}

const SaveVersionDialog: React.FC<SaveVersionDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  isLoading,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const { t } = useLanguage();

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim(), description.trim());
      setName('');
      setDescription('');
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('versions.saveDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('versions.saveDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="version-name">{t('versions.saveDialog.nameLabel')}</Label>
            <Input
              id="version-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('versions.saveDialog.namePlaceholder')}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="version-description">{t('versions.saveDialog.descriptionLabel')}</Label>
            <Textarea
              id="version-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('versions.saveDialog.descriptionPlaceholder')}
              className="mt-1"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || isLoading}
          >
            <Save className="w-4 h-4 mr-2" />
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ScheduleVersionsManager: React.FC<ScheduleVersionsManagerProps> = ({
  isOpen,
  onClose,
  onLoadVersion,
  currentParameters,
  currentSchedule,
  currentWarnings,
  onNotify,
}) => {

  const [versions, setVersions] = useState<ScheduleVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [showConfirmDeleteDialog, setShowConfirmDeleteDialog] = useState(false);
  const [showConfirmOverwriteDialog, setShowConfirmOverwriteDialog] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<ScheduleVersion | null>(null);
  const [versionToOverwrite, setVersionToOverwrite] = useState<ScheduleVersion | null>(null);
  const [newVersionName, setNewVersionName] = useState('');
  const [newVersionDescription, setNewVersionDescription] = useState('');
  
  const { t, currentDateFnsLocale } = useLanguage();

  useEffect(() => {
    if (isOpen) {
      const loaded = loadScheduleVersions();
      setVersions(loaded);
      // Automatically select the first version if available and none is selected
      if (loaded.length > 0 && !selectedVersionId) {
        setSelectedVersionId(loaded[0].id);
      } else if (loaded.length === 0) {
        setSelectedVersionId('');
      }
    }
  }, [isOpen, selectedVersionId]); // Added selectedVersionId to dependencies to handle empty list case

  const handleSaveVersion = async (name: string, description: string) => {
    if (!currentParameters) return;
    
    setIsSaving(true);
    try {
      const id = saveScheduleVersion(
        name,
        description,
        currentParameters,
        currentSchedule,
        currentWarnings
      );
      
      setVersions(loadScheduleVersions());
      setShowSaveDialog(false);

      onNotify?.({ severity: 'success', title: t('versions.toast.saved.title'), description: t('versions.toast.saved.description', { name }), autoDismissMs: 3000 });
    } catch (error) {
      onNotify?.({ severity: 'error', title: t('versions.toast.saveError.title'), description: t('versions.toast.saveError.description'), autoDismissMs: 5000 });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadVersion = () => {
    const version = getScheduleVersion(selectedVersionId);
    if (!version) return;

    try {
      const parameters = deserializeScheduleFormValues(version.parameters);
      const schedule = version.generatedSchedule 
        ? deserializeSchedule(version.generatedSchedule)
        : undefined;
      
      onLoadVersion(parameters, schedule, version.warnings);
      onClose();

      onNotify?.({ severity: 'success', title: t('versions.toast.loaded.title'), description: t('versions.toast.loaded.description', { name: version.name }), autoDismissMs: 3000 });
    } catch (error) {
      onNotify?.({ severity: 'error', title: t('versions.toast.loadError.title'), description: t('versions.toast.loadError.description'), autoDismissMs: 5000 });
    }
  };

  const handleDeleteVersion = (id: string, name: string) => {
    if (deleteScheduleVersion(id)) {
      setVersions(loadScheduleVersions());
      if (selectedVersionId === id) {
        setSelectedVersionId('');
      }

      onNotify?.({ severity: 'success', title: t('versions.toast.deleted.title'), description: t('versions.toast.deleted.description', { name }), autoDismissMs: 3000 });
    }
  };

  const handleEditVersion = (version: ScheduleVersion) => {
    setEditingVersionId(version.id);
    setEditedName(version.name);
    setEditedDescription(version.description || '');
  };

  const handleSaveEdit = (id: string) => {
    if (updateScheduleVersion(id, {
      name: editedName,
      description: editedDescription,
    })) {
      setVersions(loadScheduleVersions());
      setEditingVersionId(null);

      onNotify?.({ severity: 'success', title: t('versions.toast.updated.title'), description: t('versions.toast.updated.description'), autoDismissMs: 3000 });
    }
  };

  const handleCancelEdit = () => {
    setEditingVersionId(null);
    setEditedName('');
    setEditedDescription('');
  };

  const handleOverwriteVersion = () => {
    if (!versionToOverwrite || !currentParameters) {
      onNotify?.({ severity: 'error', title: t('versions.manager.toast.error.title'), description: t('versions.manager.toast.error.noVersionOrParamsForOverwrite'), autoDismissMs: 5000 });
      return;
    }

    const updates: Partial<Omit<ScheduleVersion, 'id' | 'createdAt'>> = {
      parameters: serializeScheduleFormValues(currentParameters),
      generatedSchedule: currentSchedule ? serializeSchedule(currentSchedule) : undefined,
      warnings: currentWarnings,
      // name and description are intentionally omitted to preserve existing ones
    };
    
    const success = updateScheduleVersion(versionToOverwrite.id, updates);

    if (success) {
      onNotify?.({ severity: 'success', title: t('versions.manager.toast.success.title'), description: t('versions.manager.toast.success.versionOverwritten', { name: versionToOverwrite.name }), autoDismissMs: 3000 });
      setVersions(loadScheduleVersions());
    } else {
      onNotify?.({ severity: 'error', title: t('versions.manager.toast.error.title'), description: t('versions.manager.toast.error.overwriteFailed', { name: versionToOverwrite.name }), autoDismissMs: 5000 });
    }
    setShowConfirmOverwriteDialog(false);
    setVersionToOverwrite(null);
  };

  const selectedVersion = versions.find(v => v.id === selectedVersionId);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="w-5 h-5" />
              {t('versions.manager.title')}
            </DialogTitle>
            <DialogDescription>
              {t('versions.manager.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Versions List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{t('versions.manager.savedVersions')}</h3>
                <Button
                  onClick={() => setShowSaveDialog(true)}
                  disabled={!currentParameters || isSaving}
                  size="sm"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {t('versions.manager.saveCurrentButton')}
                </Button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {versions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {t('versions.manager.noVersions')}
                  </div>
                ) : (
                  versions.map((version) => (
                    <Card
                      key={version.id}
                      className={`cursor-pointer transition-colors ${
                        selectedVersionId === version.id
                          ? 'ring-2 ring-primary'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedVersionId(version.id)}
                    >
                      <CardContent className="p-3">
                        {editingVersionId === version.id ? (
                          <div className="space-y-2">
                            <Input
                              value={editedName}
                              onChange={(e) => setEditedName(e.target.value)}
                              className="font-semibold"
                              aria-label={t('versions.manager.editNameLabel')}
                            />
                            <Textarea
                              value={editedDescription}
                              onChange={(e) => setEditedDescription(e.target.value)}
                              rows={2}
                              aria-label={t('versions.manager.editDescriptionLabel')}
                            />
                            <div className="flex justify-end gap-2 mt-1">
                              <Button variant="ghost" size="sm" onClick={() => handleCancelEdit()}><X className="h-3 w-3 mr-1"/> {t('versions.manager.cancelButton')}</Button>
                              <Button variant="default" size="sm" onClick={() => handleSaveEdit(version.id)}><Save className="h-3 w-3 mr-1"/> {t('versions.manager.saveButton')}</Button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <h4 className="font-semibold text-sm truncate">{version.name}</h4>
                            <p className="text-xs text-muted-foreground truncate">{version.description || t('versions.manager.noDescription')}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('versions.manager.lastModified')}: {format(new Date(version.lastModified), 'PPP p', { locale: currentDateFnsLocale })}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>

            {/* Version Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">{t('versions.manager.versionDetails')}</h3>
              
              {selectedVersion ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{selectedVersion.name}</CardTitle>
                      {selectedVersion.description && (
                        <CardDescription>{selectedVersion.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {t('versions.manager.dateRange')}
                          </span>
                          <p className="text-muted-foreground">
                            {format(new Date(selectedVersion.parameters.startDate), 'PP', {
                              locale: currentDateFnsLocale,
                            })}{' '}
                            -{' '}
                            {format(new Date(selectedVersion.parameters.endDate), 'PP', {
                              locale: currentDateFnsLocale,
                            })}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {t('versions.manager.doctors')}
                          </span>
                          <p className="text-muted-foreground">
                            {selectedVersion.parameters.numberOfDoctors} {t('versions.manager.doctorsCount')}
                          </p>
                        </div>
                      </div>
                      
                      {selectedVersion.warnings && selectedVersion.warnings.length > 0 && (
                        <div>
                          <span className="font-medium text-sm">{t('versions.manager.warnings')}</span>
                          <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                            {selectedVersion.warnings.map((warning, index) => (
                              <li key={index} className="text-orange-600">
                                • {warning}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      <div className="text-xs text-muted-foreground">
                        <p>
                          {t('versions.manager.created')}: {format(new Date(selectedVersion.createdAt), 'PPp', {
                            locale: currentDateFnsLocale,
                          })}
                        </p>
                        <p>
                          {t('versions.manager.lastModified')}: {format(new Date(selectedVersion.lastModified), 'PPp', {
                            locale: currentDateFnsLocale,
                          })}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {t('versions.manager.selectVersion')}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button
              onClick={handleLoadVersion}
              disabled={!selectedVersionId}
            >
              <Download className="w-4 h-4 mr-2" />
              {t('versions.manager.loadVersion')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SaveVersionDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleSaveVersion}
        isLoading={isSaving}
      />

      {/* Confirm Overwrite Dialog */}
      {showConfirmOverwriteDialog && versionToOverwrite && (
        <Dialog open={showConfirmOverwriteDialog} onOpenChange={(isOpen) => {
          if (!isOpen) {
            setShowConfirmOverwriteDialog(false);
            setVersionToOverwrite(null);
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-warning" />
                {t('versions.manager.confirmOverwrite.title')}
              </DialogTitle>
              <DialogDescription>
                {t('versions.manager.confirmOverwrite.description', { name: versionToOverwrite.name })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => {
                setShowConfirmOverwriteDialog(false);
                setVersionToOverwrite(null);
              }}>{t('versions.manager.cancelButton')}</Button>
              <Button variant="destructive" onClick={handleOverwriteVersion}>{t('versions.manager.overwriteButton')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default ScheduleVersionsManager; 