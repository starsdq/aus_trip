import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const itineraryPath = path.join(rootDir, "data", "itinerary.json");
const auditPath = path.join(rootDir, "data", "trip-audit.json");
const photosDir = path.join(rootDir, "assets", "photos");

const weekdayKo = ["일", "월", "화", "수", "목", "금", "토"];
const errors = [];
const warnings = [];

async function readJson(filePath, label) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    errors.push(`${label} 파일을 읽거나 JSON으로 파싱할 수 없습니다: ${detail}`);
    return null;
  }
}

function addError(location, message) {
  errors.push(`${location}: ${message}`);
}

function addWarning(location, message) {
  warnings.push(`${location}: ${message}`);
}

function parseDateRange(dateRange) {
  if (typeof dateRange !== "string") return null;
  const match = dateRange.match(/(\d{4})\.(\d{2})\.(\d{2})\s*\(([월화수목금토일])\)/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    weekday: match[4]
  };
}

function parseDayDate(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\s*\(([월화수목금토일])\)$/);
  if (!match) return null;
  return {
    month: Number(match[1]),
    day: Number(match[2]),
    weekday: match[3]
  };
}

function parseTime(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isHttpUrl(value) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isFlightEvent(event) {
  const title = typeof event.title === "string" ? event.title : "";
  const emoji = typeof event.emoji === "string" ? event.emoji : "";
  const tags = Array.isArray(event.tags) ? event.tags : [];
  return emoji.includes("✈") || title.includes("항공") || (title.includes("출발") && title.includes("도착")) || tags.includes("비행");
}

function hasNextDayMarker(event) {
  if (typeof event.timeEndNote === "string" && event.timeEndNote.trim().length > 0) return true;
  return Number.isInteger(event.arrivalDayOffset) && event.arrivalDayOffset > 0;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function validateDateRange(itinerary) {
  const start = parseDateRange(itinerary.dateRange);
  if (!start) {
    addError("dateRange", "YYYY.MM.DD (요일) 형식의 시작일을 찾을 수 없습니다.");
    return null;
  }

  const startDate = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const actualStartWeekday = weekdayKo[startDate.getUTCDay()];
  if (actualStartWeekday !== start.weekday) {
    addError("dateRange", `시작일 요일이 실제와 다릅니다. 기대값 ${actualStartWeekday}, 현재값 ${start.weekday}`);
  }

  return startDate;
}

function validateDays(itinerary, startDate) {
  if (!Array.isArray(itinerary.days)) {
    addError("days", "배열이어야 합니다.");
    return;
  }

  itinerary.days.forEach((day, index) => {
    const location = `days[${index}]`;
    const parsed = parseDayDate(day.date);
    if (!parsed) {
      addError(`${location}.date`, "M/D (요일) 형식이어야 합니다.");
      return;
    }

    const expectedDate = new Date(startDate.getTime());
    expectedDate.setUTCDate(startDate.getUTCDate() + index);
    const expectedMonth = expectedDate.getUTCMonth() + 1;
    const expectedDay = expectedDate.getUTCDate();
    const expectedWeekday = weekdayKo[expectedDate.getUTCDay()];

    if (parsed.month !== expectedMonth || parsed.day !== expectedDay) {
      addError(`${location}.date`, `날짜가 일정 순서와 다릅니다. 기대값 ${expectedMonth}/${expectedDay}, 현재값 ${parsed.month}/${parsed.day}`);
    }

    if (parsed.weekday !== expectedWeekday) {
      addError(`${location}.date`, `요일이 실제와 다릅니다. 기대값 ${expectedWeekday}, 현재값 ${parsed.weekday}`);
    }

    if (typeof day.dayNum === "number" && day.dayNum !== index + 1) {
      addError(`${location}.dayNum`, `순번이 다릅니다. 기대값 ${index + 1}, 현재값 ${day.dayNum}`);
    }
  });
}

async function validateEvent(event, location) {
  if (event.mapUrl !== undefined && !isHttpUrl(event.mapUrl)) {
    addError(`${location}.mapUrl`, "http 또는 https URL 형식이어야 합니다.");
  }

  if (event.photo === true) {
    if (typeof event.photoFile !== "string" || event.photoFile.trim().length === 0) {
      addError(`${location}.photoFile`, "photo가 true이면 photoFile이 필요합니다.");
    } else if (path.basename(event.photoFile) !== event.photoFile) {
      addError(`${location}.photoFile`, "파일명만 사용할 수 있습니다.");
    } else {
      const photoPath = path.join(photosDir, event.photoFile);
      if (!(await fileExists(photoPath))) {
        addError(`${location}.photoFile`, `사진 파일이 없습니다: assets/photos/${event.photoFile}`);
      }
    }
  }

  if (Array.isArray(event.options)) {
    event.options.forEach((option, optionIndex) => {
      const optionLocation = `${location}.options[${optionIndex}]`;
      if (option.mapUrl !== undefined && !isHttpUrl(option.mapUrl)) {
        addError(`${optionLocation}.mapUrl`, "http 또는 https URL 형식이어야 합니다.");
      }
    });
  }

  const startMinutes = parseTime(event.time);
  const endMinutes = parseTime(event.timeEnd);
  if (event.timeEnd && startMinutes !== null && endMinutes !== null && endMinutes < startMinutes && isFlightEvent(event) && !hasNextDayMarker(event)) {
    addError(`${location}.timeEnd`, "익일 도착 비행은 timeEndNote 또는 arrivalDayOffset 중 하나가 필요합니다.");
  }

  if (event.timeEnd && startMinutes !== null && endMinutes !== null && endMinutes < startMinutes && !isFlightEvent(event)) {
    addWarning(`${location}.timeEnd`, "종료 시간이 시작 시간보다 이릅니다. 익일 일정인지 확인하세요.");
  }
}

async function validateEvents(itinerary) {
  if (!Array.isArray(itinerary.days)) return;

  for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex += 1) {
    const day = itinerary.days[dayIndex];
    if (!Array.isArray(day.events)) {
      addError(`days[${dayIndex}].events`, "배열이어야 합니다.");
      continue;
    }

    for (let eventIndex = 0; eventIndex < day.events.length; eventIndex += 1) {
      await validateEvent(day.events[eventIndex], `days[${dayIndex}].events[${eventIndex}]`);
    }
  }
}

function validateAudit(audit) {
  if (!audit) return;
  if (audit.verifiedAsOf !== "2026-06-30") {
    addWarning("trip-audit.verifiedAsOf", "검증 기준일이 2026-06-30이 아닙니다.");
  }
  if (!Array.isArray(audit.sourceUrls) || audit.sourceUrls.length === 0) {
    addError("trip-audit.sourceUrls", "공식/준공식 출처 URL 목록이 필요합니다.");
    return;
  }
  audit.sourceUrls.forEach((source, index) => {
    if (!isHttpUrl(source.url)) {
      addError(`trip-audit.sourceUrls[${index}].url`, "http 또는 https URL 형식이어야 합니다.");
    }
  });
}

async function main() {
  const itinerary = await readJson(itineraryPath, "itinerary");
  const audit = await readJson(auditPath, "trip-audit");

  if (itinerary) {
    const startDate = validateDateRange(itinerary);
    if (startDate) validateDays(itinerary, startDate);
    await validateEvents(itinerary);
  }

  validateAudit(audit);

  if (warnings.length > 0) {
    console.warn("경고:");
    warnings.forEach((warning) => console.warn(`- ${warning}`));
  }

  if (errors.length > 0) {
    console.error("검증 실패:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log("검증 통과: itinerary 날짜/요일, 사진, URL, 익일 비행 표기, audit 파일을 확인했습니다.");
}

await main();
