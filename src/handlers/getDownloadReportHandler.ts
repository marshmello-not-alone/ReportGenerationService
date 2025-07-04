import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "../utils/appError";
import { GetObjectCommand } from "@aws-sdk/client-s3";

import { getDownloadReport } from "../services/report/getDownloadReportService";
import { DownloadReportParams } from "src/schemas/reportSchemas";
import { s3 } from "../integrations/s3UploadService";

function getFileExtension(mimeType: string): string {
  switch (mimeType) {
    case "APPLICATION_PDF":
      return "pdf";
    case "TEXT_CSV":
      return "csv";
    case "APPLICATION_JSON":
      return "json";
    default:
      return "bin";
  }
}

function getMimeTypeString(mimeType: string): string {
  switch (mimeType) {
    case "APPLICATION_PDF":
      return "application/pdf";
    case "TEXT_CSV":
      return "text/csv";
    case "APPLICATION_JSON":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

export const getDownloadReportHandler = async (
  request: FastifyRequest<{ Params: DownloadReportParams }>,
  reply: FastifyReply
) => {
  const { id } = request.params;

  try {
    const report = await getDownloadReport(request.server.prisma, id);

    // TODO: Add authorization check when you have user context
    // if (report.userId !== request.user?.id) {
    //   throw new AppError("Unauthorized to download this report", 403);
    // }
    if (!report.s3Key) {
      throw new AppError("Report file is not yet available", 400);
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: report.s3Key!,
    });
    const s3Response = await s3.send(command);

    if (!s3Response.Body) {
      throw new AppError("File not found in storage", 404);
    }

    const filename = `report-${report.id}.${getFileExtension(report.mimeType)}`;

    reply.header("Content-Type", getMimeTypeString(report.mimeType));
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);

    if (s3Response.ContentLength) {
      reply.header("Content-Length", s3Response.ContentLength);
    }

    return reply.send(s3Response.Body);
  } catch (error) {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    request.log.error("Error downloading report:", error);
    return reply.code(500).send({ error: "Failed to download report" });
  }
};
