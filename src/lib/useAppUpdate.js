import { useEffect, useRef, useState } from "react";

// Detects when a new version of the app has finished downloading in the
// background and is sitting ready — instead of silently waiting for every
// tab to close before it takes over, this surfaces a button so you can
// apply it on demand. Lives at the top of the app (not inside any one
// screen) so the check works from the home screen and the banner shows
// wherever you are, and keeps looking for new versions the whole time the
// app is open.
export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [updateCheckMessage, setUpdateCheckMessage] = useState(null);
  const waitingWorkerRef = useRef(null);
  const swRegistrationRef = useRef(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;

    let reloadedOnce = false;
    const onControllerChange = () => {
      if (reloadedOnce) return;
      reloadedOnce = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      swRegistrationRef.current = registration;

      // An update may already be sitting there waiting from before this
      // page load even happened.
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorkerRef.current = registration.waiting;
        setUpdateAvailable(true);
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            waitingWorkerRef.current = newWorker;
            setUpdateAvailable(true);
          }
        });
      });

      // Check right away, then keep checking — otherwise this only ever
      // runs once at initial load, and a version deployed later would sit
      // unnoticed until the next full page reload.
      registration.update().catch(() => {});
    });

    const recheck = () => {
      if (swRegistrationRef.current) swRegistrationRef.current.update().catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };
    const interval = setInterval(recheck, 30 * 60 * 1000); // every 30 minutes
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, []);

  const applyUpdate = () => {
    setApplyingUpdate(true);
    if (waitingWorkerRef.current) {
      waitingWorkerRef.current.postMessage({ type: "SKIP_WAITING" });
      // Normally this triggers a "controllerchange" event, which reloads
      // the page (see the listener above). But if the worker this was
      // sent to had already stopped being the genuine waiting one by the
      // time of the click (superseded, or the message just didn't land),
      // that event never fires — and from the button's point of view,
      // that looks exactly like "nothing happens." This is the safety
      // net: force the reload anyway if that hasn't already happened
      // shortly after asking.
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } else {
      window.location.reload();
    }
  };

  const checkForUpdateNow = async () => {
    if (!("serviceWorker" in navigator)) {
      setUpdateCheckMessage("Not available in this browser");
      setTimeout(() => setUpdateCheckMessage(null), 3000);
      return;
    }
    setUpdateCheckMessage("Checking...");
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) swRegistrationRef.current = registration;
    if (!registration) {
      setUpdateCheckMessage("Still setting up — try again in a moment");
    } else {
      await registration.update().catch(() => {});
      // Give the "updatefound" listener a moment to fire before reporting
      setTimeout(() => {
        setUpdateCheckMessage(
          waitingWorkerRef.current ? "Update found!" : "You're on the latest version"
        );
      }, 600);
    }
    setTimeout(() => setUpdateCheckMessage(null), 3000);
  };

  return { updateAvailable, applyingUpdate, updateCheckMessage, checkForUpdateNow, applyUpdate };
}
