import { Router, type IRouter } from "express";
import healthRouter from "./health";
import insightforgeRouter from "./insightforge";

const router: IRouter = Router();

router.use(healthRouter);
router.use(insightforgeRouter);

export default router;
