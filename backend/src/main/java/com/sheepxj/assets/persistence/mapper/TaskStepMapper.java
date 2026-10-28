package com.sheepxj.assets.persistence.mapper;

import com.sheepxj.assets.contract.ApiContracts.StepStatus;
import com.sheepxj.assets.persistence.model.TaskStepRecord;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TaskStepMapper {
    int insert(TaskStepRecord step);
    List<TaskStepRecord> findByTaskId(@Param("taskId") String taskId);
    int transition(@Param("step") TaskStepRecord step, @Param("expectedStatus") StepStatus expectedStatus);
}
