import { useAppStore } from '../store/useAppStore'

// Every guided tour in the app, as listed under the "?" in the header.
// To add a tour: add an entry here, and have its screen start it when the
// store's pendingTour names it (see BookingEquipment for the pattern).
//   key     — what pendingTour is set to
//   screen  — the screen it runs on (null: runs where you are)
export const TOURS = [
  { key: 'website', title: 'Website tour', desc: 'The dashboard, your profile, and where to get help.', screen: null },
  { key: 'booking', title: 'Booking Equipment', desc: 'Training and retraining, booking several instruments, purpose, your calendar, cancelling.', screen: 'booking' },
]

// Go to the tour's screen and ask it to start. The website tour is opened by
// the header itself, so it never comes through here.
export function startTour(tour) {
  const { setScreen, setPendingTour } = useAppStore.getState()
  if (tour.screen) setScreen(tour.screen)
  setPendingTour(tour.key)
}
