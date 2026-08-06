(() => {
  const modal = document.getElementById("booking-modal");
  const openButton = document.getElementById("open-booking");
  if (!modal || !openButton) return;

  const dates = document.getElementById("booking-dates");
  const times = document.getElementById("booking-slots");
  const status = document.getElementById("booking-status");
  const selection = document.getElementById("booking-selection");
  const confirm = document.getElementById("booking-confirm");
  const result = document.getElementById("booking-result");
  let slots = [], selectedDate = "", selectedSlot = null, canBook = false, lastFocus = null;

  function setStatus(kind, text) {
    status.className = `booking-status booking-status-${kind}`;
    status.textContent = text;
  }

  function setBusy(busy, label) {
    confirm.disabled = busy || !selectedSlot;
    if (label) confirm.textContent = label;
  }

  function resetPicker() {
    dates.innerHTML = "";
    times.innerHTML = "";
    slots = [];
    selectedDate = "";
    selectedSlot = null;
    result.hidden = true;
    selection.textContent = "Choose a day and time.";
    setBusy(true, "Choose a Time");
  }

  function renderTimes() {
    times.innerHTML = "";
    selectedSlot = null;
    result.hidden = true;
    selection.textContent = `${dates.querySelector('[aria-pressed="true"]')?.textContent || "Selected day"} · choose a time`;
    setBusy(true, canBook ? "Book This Time" : "Preview This Time");
    slots.filter((slot) => slot.date === selectedDate).forEach((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "booking-slot";
      button.textContent = slot.timeLabel;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        times.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        selectedSlot = slot;
        selection.textContent = slot.label;
        setBusy(false, canBook ? "Book This Time" : "Preview This Time");
      });
      times.append(button);
    });
  }

  function renderDates() {
    const groups = [];
    slots.forEach((slot) => { if (!groups.some((item) => item.date === slot.date)) groups.push(slot); });
    dates.innerHTML = "";
    groups.forEach((slot, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "booking-date";
      button.textContent = slot.dateLabel;
      button.setAttribute("aria-pressed", String(index === 0));
      button.addEventListener("click", () => {
        dates.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        selectedDate = slot.date;
        renderTimes();
      });
      dates.append(button);
    });
    if (groups[0]) {
      selectedDate = groups[0].date;
      renderTimes();
    }
  }

  async function loadAvailability() {
    resetPicker();
    setStatus("loading", "Checking Tyler’s live calendar availability…");
    try {
      const response = await fetch("/api/blueprint-review-availability", { cache: "no-store", headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Availability could not be loaded.");
      canBook = !!data.canBook;
      slots = Array.isArray(data.slots) ? data.slots : [];
      if (!slots.length) {
        setStatus("empty", "No review times are currently available. Please check again shortly.");
        selection.textContent = "No times available.";
        return;
      }
      setStatus(canBook ? "live" : "preview", canBook
        ? "Live availability. Your time is reserved only after Google Calendar confirms it."
        : "Public sample: these times come from Tyler’s live calendar, but this page will not reserve an appointment without private paid-buyer access.");
      renderDates();
    } catch (error) {
      setStatus("error", error.message || "Availability could not be loaded. Please try again.");
      selection.textContent = "Availability unavailable.";
    }
  }

  function showResult(title, text, links = {}) {
    result.hidden = false;
    result.innerHTML = "";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    result.append(heading, paragraph);
    if (links.meetUrl || links.calendarUrl) {
      const row = document.createElement("p");
      if (links.meetUrl) {
        const meet = document.createElement("a");
        meet.href = links.meetUrl; meet.target = "_blank"; meet.rel = "noopener"; meet.textContent = "Open Google Meet";
        row.append(meet);
      }
      if (links.calendarUrl) {
        if (row.childNodes.length) row.append(" · ");
        const calendar = document.createElement("a");
        calendar.href = links.calendarUrl; calendar.target = "_blank"; calendar.rel = "noopener"; calendar.textContent = "Open Calendar event";
        row.append(calendar);
      }
      result.append(row);
    }
  }

  async function confirmSelection() {
    if (!selectedSlot) return;
    if (!canBook) {
      showResult("Preview time selected", `${selectedSlot.label}. No appointment was created from this public sample.`);
      setBusy(true, "Preview Complete");
      return;
    }
    setBusy(true, "Booking…");
    try {
      const response = await fetch("/api/blueprint-review-book", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ start: selectedSlot.value }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw Object.assign(new Error(data.error || "The review could not be booked."), { code: data.code });
      const delivery = data.emailSent
        ? "A Calendar invitation and separate confirmation email with your Google Meet link have been sent to the email on your paid order."
        : "Your Calendar invitation contains the Google Meet link. The separate confirmation email may be delayed.";
      showResult("Your review is booked", `${selectedSlot.label}. ${delivery}`, data.booking || {});
      setBusy(true, "Booked");
      setStatus("live", "Google Calendar confirmed your reservation.");
    } catch (error) {
      showResult("No appointment was created", error.message || "The review could not be booked. Please try again.");
      if (error.code === "slot_unavailable") await loadAvailability();
      else setBusy(false, "Try Again");
    }
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    (lastFocus || openButton).focus();
  }

  function trapFocus(event) {
    if (event.key === "Escape") { event.preventDefault(); closeModal(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((item) => item.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  openButton.addEventListener("click", () => {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    modal.querySelector(".booking-close").focus();
    loadAvailability();
  });
  modal.querySelectorAll("[data-close-booking]").forEach((item) => item.addEventListener("click", closeModal));
  modal.addEventListener("keydown", trapFocus);
  document.addEventListener("keydown", (event) => {
    if (!modal.hidden && event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
  });
  confirm.addEventListener("click", confirmSelection);
})();
