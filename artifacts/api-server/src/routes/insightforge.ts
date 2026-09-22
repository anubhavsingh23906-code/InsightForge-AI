import { Router, type IRouter, type Request, type Response } from "express";
import {
  AnalyzeQueryBody,
  AnalyzeQueryResponse,
  AskAnalysisFollowUpBody,
  AskAnalysisFollowUpResponse,
  AskAnalysisFollowUpParams,
  CreateAnalysisBody,
  CreateAnalysisResponse,
  CreateDatasetBody,
  CreateDatasetResponse,
  CreateReportBody,
  CreateReportResponse,
  GetDashboardResponse,
  GetAnalysesResponse,
  GetAnalysisParams,
  GetAnalysisResponse,
  GetDataSourcesResponse,
  GetDatasetParams,
  GetDatasetResponse,
  GetDatasetsResponse,
  RunSimulationBody,
  RunSimulationResponse,
  DeleteAnalysisParams,
  DeleteDatasetParams,
} from "@workspace/api-zod";
import type { Analysis } from "@workspace/api-zod";

type Row = Record<string, string | number>;
type DemoKind = "air" | "parking" | "weather";
type InternalAnalysis = Analysis & {
  _datasetId: string;
  _kind: DemoKind;
  _grouped: Row[];
};

const router: IRouter = Router();

const cityNames = ["Delhi", "Noida", "Lucknow", "Ghaziabad", "Kanpur"];
const locations = [
  "Sector 62",
  "Sector 63",
  "Sector 18",
  "Botanical Garden",
  "Electronic City",
];

const airRows: Row[] = Array.from({ length: 30 }, (_, index) => {
  const cityIndex = index % cityNames.length;
  const day = Math.floor(index / cityNames.length) + 1;
  const base = [176, 142, 158, 164, 151][cityIndex];
  const variation = ((day * 7 + cityIndex * 3) % 17) - 8;
  const aqi = base + variation;
  return {
    city: cityNames[cityIndex],
    date: `2026-09-${String(day).padStart(2, "0")}`,
    AQI: aqi,
    PM25: Math.round(aqi * 0.42),
    PM10: Math.round(aqi * 0.78),
    NO2: 22 + cityIndex * 5 + day,
    status: aqi > 160 ? "Unhealthy" : "Moderate",
  };
});

const parkingRows: Row[] = Array.from({ length: 25 }, (_, index) => {
  const locationIndex = index % locations.length;
  const day = Math.floor(index / locations.length) + 1;
  const capacity = [220, 180, 340, 260, 310][locationIndex];
  const demandBase = [81, 74, 92, 68, 87][locationIndex];
  const demand = demandBase + ((day * 4 + locationIndex) % 11) - 5;
  return {
    location: locations[locationIndex],
    date: `2026-09-${String(day).padStart(2, "0")}`,
    time: "18:00",
    capacity,
    occupied: Math.round((capacity * demand) / 100),
    demand,
    latitude: 28.56 + locationIndex * 0.018,
    longitude: 77.21 + locationIndex * 0.021,
  };
});

const weatherRows: Row[] = Array.from({ length: 25 }, (_, index) => {
  const cityIndex = index % cityNames.slice(0, 3).length;
  const day = Math.floor(index / 3) + 1;
  const rainfall = [12, 26, 18][cityIndex] + ((day * 5 + cityIndex) % 23);
  return {
    city: cityNames[cityIndex],
    date: `2026-09-${String(day).padStart(2, "0")}`,
    temperature: 29 + cityIndex * 2 + (day % 4),
    humidity: 61 + cityIndex * 5 + (day % 6),
    rainfall,
    wind_speed: 8 + cityIndex * 2 + (day % 5),
  };
});

const nowLabel = "Sep 22, 2026";

const datasetDetails: Record<string, {
  id: string;
  name: string;
  source: string;
  category: string;
  rows: number;
  columns: number;
  quality: number;
  updated: string;
  synthetic: boolean;
  fields: string[];
  preview: Row[];
  kind: DemoKind;
}> = {
  "ds-air": {
    id: "ds-air",
    name: "Delhi NCR Air Quality",
    source: "Demo Dataset",
    category: "Environmental",
    rows: airRows.length,
    columns: 7,
    quality: 97.8,
    updated: "Today, 09:42",
    synthetic: true,
    fields: ["city", "date", "AQI", "PM25", "PM10", "NO2", "status"],
    preview: airRows.slice(0, 5),
    kind: "air",
  },
  "ds-parking": {
    id: "ds-parking",
    name: "Noida Parking Demand",
    source: "Demo Dataset",
    category: "Mobility",
    rows: parkingRows.length,
    columns: 8,
    quality: 96.4,
    updated: "Yesterday, 18:16",
    synthetic: true,
    fields: [
      "location",
      "date",
      "time",
      "capacity",
      "occupied",
      "demand",
      "latitude",
      "longitude",
    ],
    preview: parkingRows.slice(0, 5),
    kind: "parking",
  },
  "ds-weather": {
    id: "ds-weather",
    name: "North India Weather",
    source: "Demo Dataset",
    category: "Weather",
    rows: weatherRows.length,
    columns: 6,
    quality: 98.1,
    updated: "Sep 20, 14:05",
    synthetic: true,
    fields: ["city", "date", "temperature", "humidity", "rainfall", "wind_speed"],
    preview: weatherRows.slice(0, 5),
    kind: "weather",
  },
};

const datasets = Object.values(datasetDetails);
const analyses = new Map<string, InternalAnalysis>();

function datasetForQuestion(question: string, datasetId?: string | null) {
  if (datasetId && datasetDetails[datasetId]) return datasetDetails[datasetId];
  const normalized = question.toLowerCase();
  if (normalized.includes("parking") || normalized.includes("capacity") || normalized.includes("occupied")) {
    return datasetDetails["ds-parking"];
  }
  if (normalized.includes("rain") || normalized.includes("weather") || normalized.includes("temperature")) {
    return datasetDetails["ds-weather"];
  }
  return datasetDetails["ds-air"];
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function groupAverage(rows: Row[], groupKey: string, valueKey: string) {
  const groups = new Map<string, number[]>();
  rows.forEach((row) => {
    const group = String(row[groupKey]);
    const value = Number(row[valueKey]);
    if (!Number.isNaN(value)) groups.set(group, [...(groups.get(group) ?? []), value]);
  });
  return Array.from(groups, ([group, values]) => ({
    [groupKey]: group,
    [valueKey]: Math.round(average(values)),
  }));
}

function qualityFor(dataset: typeof datasetDetails[string]) {
  const allRows = dataset.kind === "air" ? airRows : dataset.kind === "parking" ? parkingRows : weatherRows;
  const missingCells = allRows.reduce(
    (count, row) => count + dataset.fields.filter((field) => row[field] === undefined || row[field] === null).length,
    0,
  );
  const duplicates = allRows.length - new Set(allRows.map((row) => JSON.stringify(row))).size;
  const numericFields = dataset.fields.filter((field) => typeof allRows[0]?.[field] === "number");
  const outliers = numericFields.reduce((count, field) => {
    const values = allRows.map((row) => Number(row[field])).filter((value) => !Number.isNaN(value));
    const mean = average(values);
    const variance = average(values.map((value) => (value - mean) ** 2));
    const deviation = Math.sqrt(variance);
    return count + values.filter((value) => deviation > 0 && Math.abs(value - mean) > deviation * 1.8).length;
  }, 0);
  const totalCells = allRows.length * dataset.fields.length;
  return {
    rows: allRows.length,
    columns: dataset.fields.length,
    missing: Number(((missingCells / totalCells) * 100).toFixed(1)),
    duplicates: Number(((duplicates / allRows.length) * 100).toFixed(1)),
    invalid: 0,
    outliers: Number(((outliers / allRows.length) * 100).toFixed(1)),
    explanation: missingCells
      ? `${missingCells} cells were missing and excluded from metric calculations.`
      : "All required fields were present in the demo dataset. No rows were excluded.",
  };
}

function buildAnalysis(question: string, datasetId?: string | null): InternalAnalysis {
  const dataset = datasetForQuestion(question, datasetId);
  const id = `an-${String(analyses.size + 1).padStart(3, "0")}`;
  const lowerQuestion = question.toLowerCase();
  const isParking = dataset.kind === "parking";
  const isWeather = dataset.kind === "weather";
  const rows = isParking ? parkingRows : isWeather ? weatherRows : airRows;
  const valueKey = isParking ? "demand" : isWeather ? "rainfall" : "AQI";
  const groupKey = isParking ? "location" : "city";
  const grouped = groupAverage(rows, groupKey, valueKey);
  const sorted = [...grouped].sort((a, b) => Number(a[valueKey]) - Number(b[valueKey]));
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  const qualityDetails = qualityFor(dataset);
  const metricLabel = isParking ? "average demand" : isWeather ? "average rainfall" : "average AQI";
  const goal = isParking
    ? "Find the areas with the strongest parking demand and compare utilization."
    : isWeather
      ? "Identify unusual rainfall patterns across the tracked cities."
      : "Compare air quality across selected cities over the requested period.";
  const evidenceId = `${id}-ev-1`;
  const timestamp = new Date().toISOString();
  const insightTitle = isParking
    ? `${high[groupKey]} showed the highest parking demand`
    : isWeather
      ? `${high[groupKey]} recorded the highest average rainfall`
      : `${low[groupKey]} showed the lowest average AQI`;
  const chartTitle = isParking
    ? "Average parking demand by area"
    : isWeather
      ? "Average rainfall by city"
      : "Average AQI by city";

  return {
    id,
    question,
    status: "completed",
    createdAt: timestamp,
    quality: dataset.quality,
    sources: [dataset.source],
    records: rows.length,
    plan: {
      goal,
      requiredData: dataset.fields.slice(0, isParking ? 6 : 5),
      operations: [
        `Calculate ${metricLabel}`,
        `Compare ${groupKey} values`,
        "Identify highest and lowest values",
        "Generate explainable visualizations",
      ],
      visualizations: [isParking ? "bar chart" : "bar chart", isWeather ? "line chart" : "area chart"],
    },
    steps: [
      ["understand", "Understanding request", "Parsed natural-language question and selected a demo dataset."],
      ["plan", "Creating analysis plan", "Mapped the question to grouped comparison and pattern detection."],
      ["data", "Identifying required data", `Required ${dataset.fields.length} fields from ${dataset.name}.`],
      ["source", "Selecting data sources", "Selected a clearly labelled synthetic demo dataset."],
      ["collect", "Collecting data", `Loaded ${rows.length} deterministic records.`],
      ["validate", "Validating data", `Calculated a ${dataset.quality}% data quality score.`],
      ["clean", "Cleaning data", qualityDetails.explanation],
      ["analyze", "Running analysis", `Computed ${metricLabel} for ${grouped.length} groups.`],
      ["patterns", "Detecting patterns", `Compared ${low[groupKey]} through ${high[groupKey]}.`],
      ["visualize", "Generating visualizations", "Selected visualizations based on the shape of the result."],
      ["insights", "Generating insights", "Generated an evidence-linked summary from the calculated values."],
      ["evidence", "Building evidence", "Attached source, fields, calculation, and timestamp provenance."],
    ].map(([stepId, label, detail]) => ({ id: stepId, label, status: "completed", detail })),
    insights: [
      {
        id: `${id}-insight-1`,
        title: insightTitle,
        explanation: `${low[groupKey]} measured ${low[valueKey]} while ${high[groupKey]} measured ${high[valueKey]}. These values are calculated from the Demo Dataset, not live conditions.`,
        confidence: 0.96,
        metric: `${low[valueKey]} ${isWeather ? "mm" : isParking ? "%" : "AQI"}`,
        comparison: `${low[groupKey]} ${low[valueKey]} vs ${high[groupKey]} ${high[valueKey]}`,
        evidenceId,
      },
      {
        id: `${id}-insight-2`,
        title: `${high[groupKey]} is the strongest comparison point`,
        explanation: `The highest ${metricLabel} in this slice is ${high[valueKey]}. Use the chart to compare every group before drawing a wider conclusion.`,
        confidence: 0.89,
        metric: `${high[valueKey]}`,
        comparison: `${grouped.length} groups compared`,
        evidenceId,
      },
    ],
    charts: [
      {
        id: `${id}-chart-1`,
        title: chartTitle,
        type: "bar",
        xKey: groupKey,
        yKey: valueKey,
        note: `Calculated from ${rows.length} synthetic records.`,
        data: grouped,
      },
      {
        id: `${id}-chart-2`,
        title: isWeather ? "Daily rainfall trend" : isParking ? "Demand over time" : "AQI trend by date",
        type: "line",
        xKey: "date",
        yKey: valueKey,
        note: "Daily values from the same selected demo dataset.",
        data: rows.slice(0, 15).map((row) => ({ date: String(row.date).slice(5), value: Number(row[valueKey]) })),
      },
    ],
    qualityDetails,
    evidence: [
      {
        id: evidenceId,
        insight: insightTitle,
        dataset: dataset.name,
        records: rows.length,
        calculation: `mean(${valueKey}) grouped by ${groupKey}`,
        source: "Demo Dataset",
        fields: dataset.fields,
        timestamp,
      },
    ],
    geographic: isParking,
    whatIf: {
      label: isParking ? "Increase parking capacity by 20%" : "Increase the selected metric by 10%",
      current: isParking ? Math.round(average(parkingRows.map((row) => Number(row.capacity)))) : Math.round(average(grouped.map((row) => Number(row[valueKey])))),
      simulated: 0,
      difference: 0,
      percent: isParking ? 20 : 10,
    },
    _datasetId: dataset.id,
    _kind: dataset.kind,
    _grouped: grouped,
  };
}

function toPublicAnalysis(analysis: ReturnType<typeof buildAnalysis>) {
  const { _datasetId: _ignoredDatasetId, _kind: _ignoredKind, _grouped: _ignoredGrouped, ...publicAnalysis } = analysis;
  return publicAnalysis;
}

const starterAnalysis = buildAnalysis("Compare air quality across Delhi, Noida and Lucknow.", "ds-air");
analyses.set(starterAnalysis.id, starterAnalysis);

router.get("/dashboard", (_req, res): void => {
  const recentAnalyses = Array.from(analyses.values()).slice(-4).reverse().map((analysis) => ({
    id: analysis.id,
    question: analysis.question,
    status: analysis.status,
    createdAt: analysis.createdAt,
    quality: analysis.quality,
    sources: analysis.sources,
    records: analysis.records,
  }));
  const payload = {
    stats: {
      analysesCompleted: 24 + analyses.size,
      dataSources: 3,
      recordsAnalyzed: datasets.reduce((total, dataset) => total + dataset.rows, 0),
      averageQuality: Number((datasets.reduce((total, dataset) => total + dataset.quality, 0) / datasets.length).toFixed(1)),
    },
    recentAnalyses,
    featuredDatasets: datasets.slice(0, 3).map(({ fields: _fields, preview: _preview, kind: _kind, ...dataset }) => dataset),
    activity: [
      { id: "activity-1", label: "Analysis completed", detail: "Air quality comparison is ready", time: "12 min ago", type: "analysis" },
      { id: "activity-2", label: "Dataset validated", detail: "Delhi NCR Air Quality scored 97.8%", time: "42 min ago", type: "quality" },
      { id: "activity-3", label: "Demo mode active", detail: "Synthetic datasets are clearly labelled", time: "Today", type: "system" },
    ],
  };
  res.json(GetDashboardResponse.parse(payload));
});

router.get("/data-sources", (_req, res): void => {
  res.json(GetDataSourcesResponse.parse([
    { id: "source-demo", name: "Demo Dataset Library", type: "Seeded synthetic data", status: "Connected", updated: nowLabel, records: 80, quality: 97.4, description: "Deterministic air quality, parking, and weather data for demos." },
    { id: "source-upload", name: "Uploaded datasets", type: "CSV / JSON", status: "Ready", updated: "Not connected", records: 0, quality: 0, description: "Upload your own CSV or JSON files in the next stage." },
    { id: "source-api", name: "External APIs", type: "API", status: "Planned", updated: "Not connected", records: 0, quality: 0, description: "Architecture reserved for server-side data connectors." },
  ]));
});

router.get("/datasets", (_req, res): void => {
  res.json(GetDatasetsResponse.parse(datasets.map(({ fields: _fields, preview: _preview, kind: _kind, ...dataset }) => dataset)));
});

router.post("/datasets", (req, res): void => {
  const parsed = CreateDatasetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = `ds-upload-${datasets.length + 1}`;
  const dataset = {
    ...parsed.data,
    id,
    updated: "Just now",
    synthetic: false,
    fields: [],
    preview: [],
    kind: "air" as DemoKind,
  };
  datasetDetails[id] = dataset;
  datasets.push(dataset);
  res.status(201).json(CreateDatasetResponse.parse(dataset));
});

router.get("/datasets/:id", (req, res): void => {
  const parsed = GetDatasetParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const dataset = datasetDetails[parsed.data.id];
  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }
  res.json(GetDatasetResponse.parse(dataset));
});

router.delete("/datasets/:id", (req, res): void => {
  const parsed = DeleteDatasetParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const index = datasets.findIndex((dataset) => dataset.id === parsed.data.id);
  if (index < 0) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }
  datasets.splice(index, 1);
  delete datasetDetails[parsed.data.id];
  res.sendStatus(204);
});

router.get("/analyses", (_req, res): void => {
  res.json(GetAnalysesResponse.parse(Array.from(analyses.values()).reverse().map((analysis) => ({
    id: analysis.id,
    question: analysis.question,
    status: analysis.status,
    createdAt: analysis.createdAt,
    quality: analysis.quality,
    sources: analysis.sources,
    records: analysis.records,
  }))));
});

function createAnalysis(req: Request, res: Response): void {
  const parsed = CreateAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const analysis = buildAnalysis(parsed.data.question, parsed.data.datasetId);
  analyses.set(analysis.id, analysis);
  res.status(201).json(CreateAnalysisResponse.parse(toPublicAnalysis(analysis)));
}

router.post("/analyses", createAnalysis);
router.post("/analysis", (req, res): void => {
  const parsed = AnalyzeQueryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const analysis = buildAnalysis(parsed.data.question, parsed.data.datasetId);
  analyses.set(analysis.id, analysis);
  res.status(201).json(AnalyzeQueryResponse.parse(toPublicAnalysis(analysis)));
});

router.get("/analyses/:id", (req, res): void => {
  const parsed = GetAnalysisParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const analysis = analyses.get(parsed.data.id);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  res.json(GetAnalysisResponse.parse(toPublicAnalysis(analysis)));
});

router.delete("/analyses/:id", (req, res): void => {
  const parsed = DeleteAnalysisParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!analyses.delete(parsed.data.id)) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/analyses/:id/follow-up", (req, res): void => {
  const params = AskAnalysisFollowUpParams.safeParse(req.params);
  const body = AskAnalysisFollowUpBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Follow-up question is invalid." });
    return;
  }
  const analysis = analyses.get(params.data.id);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  const question = body.data.question.toLowerCase();
  const firstInsight = analysis.insights[0];
  const answer = question.includes("why")
    ? `The difference is visible in the grouped ${analysis._kind === "air" ? "AQI" : analysis._kind === "parking" ? "demand" : "rainfall"} calculation. ${firstInsight.explanation}`
    : question.includes("chart")
      ? "The comparison chart is already scoped to this analysis and uses the same validated demo records."
      : `This analysis compares ${analysis.records} records from ${analysis.sources[0]}. ${firstInsight.explanation}`;
  res.json(AskAnalysisFollowUpResponse.parse({
    answer,
    context: `Scoped to ${analysis.question}`,
    supportingData: analysis._grouped,
  }));
});

router.post("/reports", (req, res): void => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const analysis = analyses.get(parsed.data.analysisId);
  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }
  const report = {
    id: `report-${analysis.id}`,
    analysisId: analysis.id,
    format: parsed.data.format,
    title: "InsightForge AI analysis report",
    generatedAt: new Date().toISOString(),
    sections: [
      { title: "Question", content: analysis.question },
      { title: "Executive summary", content: analysis.insights.map((insight) => insight.explanation).join(" ") },
      { title: "Data sources", content: `${analysis.sources.join(", ")} (${analysis.records} records)` },
      { title: "Data quality", content: `${analysis.quality}% overall quality. ${analysis.qualityDetails.explanation}` },
      { title: "Methodology", content: analysis.plan.operations.join("; ") },
      { title: "Limitations", content: "This is a synthetic demo dataset and does not represent live conditions." },
    ],
  };
  res.status(201).json(CreateReportResponse.parse(report));
});

router.post("/simulation", (req, res): void => {
  const parsed = RunSimulationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const current = parsed.data.baseline;
  const percent = parsed.data.changePercent;
  const simulated = Number((current * (1 + percent / 100)).toFixed(2));
  res.json(RunSimulationResponse.parse({
    label: parsed.data.label ?? "Deterministic what-if simulation",
    current,
    simulated,
    difference: Number((simulated - current).toFixed(2)),
    percent,
  }));
});

export default router;