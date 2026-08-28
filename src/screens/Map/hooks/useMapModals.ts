import { useState, useCallback } from 'react';
import type { RouteStop } from '../../../types/geo';

export function useMapModals() {
  const [showLayersModal, setShowLayersModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showListsModal, setShowListsModal] = useState(false);
  const [showQuickActionsModal, setShowQuickActionsModal] = useState(false);
  const [showQuickRgModal, setShowQuickRgModal] = useState(false);
  const [showStopActionsModal, setShowStopActionsModal] = useState(false);
  const [selectedStopForActions, setSelectedStopForActions] = useState<RouteStop | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const openStopActions = useCallback((stop: RouteStop) => {
    setSelectedStopForActions(stop);
    setShowStopActionsModal(true);
  }, []);

  const closeStopActions = useCallback(() => {
    setShowStopActionsModal(false);
    setSelectedStopForActions(null);
  }, []);

  return {
    showLayersModal,
    setShowLayersModal,
    showAddModal,
    setShowAddModal,
    showMenuModal,
    setShowMenuModal,
    showListsModal,
    setShowListsModal,
    showQuickActionsModal,
    setShowQuickActionsModal,
    showQuickRgModal,
    setShowQuickRgModal,
    showStopActionsModal,
    setShowStopActionsModal,
    selectedStopForActions,
    setSelectedStopForActions,
    openStopActions,
    closeStopActions,
    showConfigModal,
    setShowConfigModal,
  };
}
