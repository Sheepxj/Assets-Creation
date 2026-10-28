package com.sheepxj.assets.persistence.mapper;

import com.sheepxj.assets.contract.ApiContracts.TaskStage;
import com.sheepxj.assets.contract.ApiContracts.TaskStatus;
import com.sheepxj.assets.persistence.model.TaskRecord;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TaskMapper {
    int insert(TaskRecord task);
    TaskRecord findById(@Param("id") String id);
    TaskRecord findByIdAndUserId(@Param("id") String id, @Param("userId") String userId);
    TaskRecord findByRequestId(@Param("userId") String userId, @Param("requestId") String requestId);
    TaskRecord findOldestQueued();
    List<TaskRecord> findRunning();
    List<TaskRecord> findByUserId(@Param("userId") String userId, @Param("status") TaskStatus status,
            @Param("limit") int limit, @Param("offset") long offset);
    long countByUserId(@Param("userId") String userId, @Param("status") TaskStatus status);
    List<TaskRecord> findActiveByUserId(@Param("userId") String userId);
    int transition(@Param("task") TaskRecord task, @Param("expectedStatus") TaskStatus expectedStatus,
            @Param("expectedStage") TaskStage expectedStage);
}
