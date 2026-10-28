package com.sheepxj.assets.persistence.mapper;

import com.sheepxj.assets.persistence.model.TaskAssetRecord;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TaskAssetMapper {
    int insert(TaskAssetRecord link);
    List<TaskAssetRecord> findByTaskIdAndUserId(@Param("taskId") String taskId, @Param("userId") String userId);
}
